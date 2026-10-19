import { afterEach, describe, expect, it } from 'vitest';
import { connect, pair } from './contractClient';
import { MockCap, MockGateway, startMockGateway } from './mockGateway';

let gateway: MockGateway | null = null;

afterEach(async () => {
  await gateway?.close();
  gateway = null;
});

async function phone(caps: MockCap[]) {
  gateway = await startMockGateway({ caps });
  const { result } = await pair(gateway);
  const client = connect(gateway);
  await client.call('hello', { deviceToken: result.deviceToken });
  return client;
}

async function paneIds(client: Awaited<ReturnType<typeof phone>>) {
  return (await client.call('pane.list')).result.panes.map((pane: any) => pane.paneId);
}

describe('a phone starts an agent (contract v1.8, agent.start)', () => {
  it('PHC-C20 the first message starts the agent in a new tab of the workspace and types into no other pane', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    const before = await paneIds(client);
    const { result } = await client.call('agent.start', { sessionId: 's-dot', agent: 'codex', prompt: 'tidy my zsh aliases' });
    expect(result).toEqual({ paneId: expect.any(String), confirmed: true });
    expect(before).not.toContain(result.paneId);
    const pane = (await client.call('pane.list', { sessionId: 's-dot' })).result.panes.find((p: any) => p.paneId === result.paneId);
    expect(pane).toEqual(expect.objectContaining({ sessionId: 's-dot', kind: 'terminal', agent: 'codex' }));
    await client.call('pty.attach', { paneId: result.paneId, role: 'observer', sinceCursor: 0 });
    await client.settle();
    expect(client.output.join('')).toContain("codex 'tidy my zsh aliases'");
    for (const paneId of before) expect(gateway!.typed(paneId)).toEqual([]);
  });

  it('PHC-C21 refuses an unknown workspace, another agent and a prompt that could act as a flag or command, and opens nothing', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    const before = await paneIds(client);
    const refusals: [object, string][] = [
      [{ sessionId: 's-gone', agent: 'claude', prompt: 'fix the build' }, 'unknown-session'],
      [{ sessionId: 's-api', agent: 'bash', prompt: 'fix the build' }, 'bad-params'],
      [{ sessionId: 's-api', agent: 'claude', prompt: '--dangerously-skip-permissions fix it' }, 'bad-params'],
      [{ sessionId: 's-api', agent: 'claude', prompt: '+x run' }, 'bad-params'],
      [{ sessionId: 's-api', agent: 'claude', prompt: 'hello' }, 'bad-params'],
      [{ sessionId: 's-api', agent: 'claude', prompt: '   ' }, 'bad-params'],
      [{ sessionId: 's-api', agent: 'claude', prompt: `fix ${'x'.repeat(4000)}` }, 'bad-params'],
    ];
    for (const [params, message] of refusals) {
      expect((await client.call('agent.start', params)).error).toEqual(expect.objectContaining({ code: -32602, message }));
    }
    expect(await paneIds(client)).toEqual(before);
  });

  it('PHC-C22 starting an agent needs respond, and a phone starts at most three a minute', async () => {
    const reader = await phone(['read', 'notify']);
    const denied = await reader.call('agent.start', { sessionId: 's-api', agent: 'claude', prompt: 'fix the build' });
    expect(denied.error).toEqual(expect.objectContaining({ code: -32003, data: { cap: 'respond' } }));
    await gateway!.close();
    const client = await phone(['read', 'notify', 'respond']);
    for (let i = 0; i < 3; i++) expect((await client.call('agent.start', { sessionId: 's-api', agent: 'claude', prompt: `task number ${i}` })).result).toBeDefined();
    const limited = await client.call('agent.start', { sessionId: 's-api', agent: 'claude', prompt: 'one more task' });
    expect(limited.error).toEqual(expect.objectContaining({ code: -32007, message: 'rate-limited' }));
  });
});
