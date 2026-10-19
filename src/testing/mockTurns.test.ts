import { afterEach, describe, expect, it } from 'vitest';
import { parseSnippets } from '../model/snippets';
import { parseTurnList } from '../model/turns';
import { connect, pair } from './contractClient';
import { MockCap, MockGateway, MockGatewayOptions, startMockGateway } from './mockGateway';

let gateway: MockGateway | null = null;

afterEach(async () => {
  await gateway?.close();
  gateway = null;
});

async function phone(caps: MockCap[], options: MockGatewayOptions = {}) {
  gateway = await startMockGateway({ caps, ...options });
  const { result } = await pair(gateway);
  const client = connect(gateway);
  const hello = await client.call('hello', { deviceToken: result.deviceToken });
  return { client, hello };
}

describe('turns, snippets and the Phone workspace (contract v1.9)', () => {
  it('PHA-C22 turn.list answers an agent pane\'s turns as the desktop does', async () => {
    const { client } = await phone(['read', 'notify']);
    const list = parseTurnList((await client.call('turn.list', { paneId: 'p-agent' })).result);
    expect(list.turns.map((turn) => turn.id)).toEqual(['t-1', 't-2']);
    expect(list.turns[0].steps[2]).toEqual({ id: 'st-3', kind: 'command', target: 'pnpm test export', exitCode: 1, output: true });
    expect((await client.call('turn.list', { paneId: 'p-api-zsh' })).result).toEqual({ turns: [], truncated: false });
    expect((await client.call('turn.list', { paneId: 'p-gone' })).error).toEqual(expect.objectContaining({ code: -32602, message: 'not-an-agent' }));
  });

  it('PHA-C23 turn.output answers only a step that kept output', async () => {
    const { client } = await phone(['read', 'notify']);
    expect((await client.call('turn.output', { paneId: 'p-agent', stepId: 'st-3' })).result.output).toContain('1 failed');
    expect((await client.call('turn.output', { paneId: 'p-agent', stepId: 'st-1' })).error).toEqual(expect.objectContaining({ message: 'unknown-step' }));
  });

  it('PHA-C26 snippet.list answers the human\'s own snippets, the workspace\'s only for that workspace', async () => {
    const { client } = await phone(['read', 'notify']);
    expect(parseSnippets((await client.call('snippet.list', {})).result).map((s) => s.name)).toEqual(['standup']);
    expect(parseSnippets((await client.call('snippet.list', { sessionId: 's-ostia' })).result).map((s) => s.name)).toEqual(['standup', 'release-notes']);
    expect((await client.call('snippet.list', { sessionId: 's-gone' })).error).toEqual(expect.objectContaining({ message: 'unknown-session' }));
  });

  it('PHA-C22 PHA-C23 a failed redaction sends no turn and no output', async () => {
    const { client } = await phone(['read', 'notify'], { redactionFails: true });
    for (const method of ['turn.list', 'turn.output']) {
      const reply = await client.call(method, { paneId: 'p-agent', stepId: 'st-3' });
      expect(reply.error).toEqual(expect.objectContaining({ code: -32603, message: 'redaction-failed' }));
      expect(reply.result).toBeUndefined();
    }
  });

  it('reading turns and snippets needs read', async () => {
    const { client } = await phone(['notify']);
    for (const method of ['turn.list', 'turn.output', 'snippet.list']) {
      expect((await client.call(method, { paneId: 'p-agent', stepId: 'st-3' })).error).toEqual(expect.objectContaining({ code: -32003 }));
    }
  });

  it('PHA-C27 with a Phone workspace, hello names it, session.list marks it and agent.start without a workspace starts there', async () => {
    const { client, hello } = await phone(['read', 'notify', 'respond'], { phoneWorkspace: { sessionId: 's-dot', agent: 'codex' } });
    expect(hello.result.phoneWorkspace).toEqual({ set: true, agent: 'codex' });
    expect((await client.call('session.list')).result.sessions.filter((s: { phone?: boolean }) => s.phone).map((s: { sessionId: string }) => s.sessionId)).toEqual(['s-dot']);
    const { result } = await client.call('agent.start', { prompt: 'tidy my zsh aliases' });
    const pane = (await client.call('pane.list', { sessionId: 's-dot' })).result.panes.find((p: { paneId: string }) => p.paneId === result.paneId);
    expect(pane).toEqual(expect.objectContaining({ agent: 'codex', sessionId: 's-dot' }));
  });

  it('PHA-C28 without a Phone workspace, agent.start without a workspace opens nothing', async () => {
    const { client, hello } = await phone(['read', 'notify', 'respond']);
    expect(hello.result.phoneWorkspace).toBeUndefined();
    const before = (await client.call('pane.list')).result.panes.length;
    expect((await client.call('agent.start', { prompt: 'tidy my zsh aliases' })).error).toEqual(expect.objectContaining({ code: -32602, message: 'phone-workspace-unavailable' }));
    expect((await client.call('pane.list')).result.panes).toHaveLength(before);
  });
});
