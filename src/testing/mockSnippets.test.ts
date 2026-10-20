import { afterEach, describe, expect, it } from 'vitest';
import { parseSnippets } from '../model/snippets';
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

describe('snippets and the Phone workspace (contract v1.9)', () => {
  it('PHA-C26 snippet.list answers the human\'s own snippets, the workspace\'s only for that workspace', async () => {
    const { client } = await phone(['read', 'notify']);
    expect(parseSnippets((await client.call('snippet.list', {})).result).map((s) => s.name)).toEqual(['standup']);
    expect(parseSnippets((await client.call('snippet.list', { sessionId: 's-ostia' })).result).map((s) => s.name)).toEqual(['standup', 'release-notes']);
    expect((await client.call('snippet.list', { sessionId: 's-gone' })).error).toEqual(expect.objectContaining({ message: 'unknown-session' }));
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
