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

describe('agent control (contract v1.6)', () => {
  it('AGT-C1 approving a permission ask resolves it for every phone', async () => {
    const first = await phone(['read', 'notify', 'respond']);
    const second = connect(gateway!);
    gateway!.mintCode();
    const { result } = await pair(gateway!);
    await second.call('hello', { deviceToken: result.deviceToken });
    const { result: list } = await first.call('ask.list');
    const ask = list.asks.find((a: any) => a.kind === 'permission');
    const approve = ask.choices.find((c: any) => c.tone === 'approve');
    expect((await first.call('ask.answer', { askId: ask.askId, choiceId: approve.id })).result).toEqual({ ok: true });
    await second.settle();
    expect(second.unsolicited).toContainEqual(
      expect.objectContaining({ params: { type: 'ask.resolved', payload: { askId: ask.askId, outcome: approve.id } } }),
    );
    expect((await first.call('ask.list')).result.asks.map((a: any) => a.askId)).not.toContain(ask.askId);
  });

  it('AGT-C2 answering a resolved ask again is unknown-ask and changes nothing', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    const [ask] = (await client.call('ask.list')).result.asks;
    await client.call('ask.answer', { askId: ask.askId, choiceId: ask.choices[0].id });
    const before = (await client.call('ask.list')).result.asks;
    const again = await client.call('ask.answer', { askId: ask.askId, choiceId: ask.choices[0].id });
    expect(again.error).toEqual(expect.objectContaining({ code: -32602, message: 'unknown-ask' }));
    expect((await client.call('ask.list')).result.asks).toEqual(before);
  });

  it('AGT-C3 answering, prompting and interrupting need respond', async () => {
    const client = await phone(['read', 'notify', 'input']);
    const [ask] = (await client.call('ask.list')).result.asks;
    const replies = [
      await client.call('ask.answer', { askId: ask.askId, choiceId: ask.choices[0].id }),
      await client.call('agent.prompt', { paneId: 'p-agent', text: 'hi' }),
      await client.call('agent.interrupt', { paneId: 'p-agent', key: 'esc' }),
    ];
    for (const reply of replies) expect(reply.error).toEqual(expect.objectContaining({ code: -32003, data: { cap: 'respond' } }));
  });

  it('AGT-C4 a prompt reaches the agent pane as text and Enter', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    await client.call('pty.attach', { paneId: 'p-agent', role: 'observer', sinceCursor: 0 });
    client.output.length = 0;
    expect((await client.call('agent.prompt', { paneId: 'p-agent', text: 'run the tests' })).result).toEqual({ ok: true });
    await client.settle();
    expect(gateway!.typed('p-agent')).toEqual(['run the tests\r']);
    expect(client.output.join('')).toContain('run the tests');
  });

  it('AGT-C5 a plain shell pane is not an agent', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    for (const reply of [
      await client.call('agent.prompt', { paneId: 'p-api-zsh', text: 'ls' }),
      await client.call('agent.interrupt', { paneId: 'p-api-zsh', key: 'ctrl-c' }),
    ]) {
      expect(reply.error).toEqual(expect.objectContaining({ code: -32602, message: 'not-an-agent' }));
    }
    expect(gateway!.typed('p-api-zsh')).toEqual([]);
  });
});
