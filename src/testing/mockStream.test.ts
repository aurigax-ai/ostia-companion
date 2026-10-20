import { afterEach, describe, expect, it } from 'vitest';
import { applyFrame, EMPTY_STREAM, parseFrame } from '../model/agentStream';
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
  await client.call('hello', { deviceToken: result.deviceToken });
  return client;
}

const frames = (client: { unsolicited: any[] }) => client.unsolicited.filter((m) => m.params?.type === 'agent.stream').map((m) => m.params.payload);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('the agent stream (contract v1.12)', () => {
  it('PHC-C1 agent.stream.open answers the agent and session first, then the backfill ends in live', async () => {
    const client = await phone(['read', 'notify']);
    const { result } = await client.call('agent.stream.open', { paneId: 'p-agent', turns: 5 });
    expect(result).toEqual({ ok: true, paneId: 'p-agent', agent: 'claude', session: 'sess-p-agent', truncated: false });
    await sleep(100);
    const got = frames(client).map((payload) => parseFrame(payload)!);
    expect(got.map((f) => [f.seq, f.backfill])).toEqual([[1, true]]);
    const events = got.flatMap((f) => f.events);
    expect(events[events.length - 1]).toEqual({ type: 'live' });
    const state = got.reduce((s, f) => applyFrame(s, f, 0), EMPTY_STREAM);
    expect(state.live).toBe(true);
    expect(state.turns.map((t) => t.status)).toEqual(['done', 'running']);
  });

  it('PHC-C1 turns limits the backfill to the newest turns and says it was cut', async () => {
    const client = await phone(['read', 'notify']);
    const { result } = await client.call('agent.stream.open', { paneId: 'p-agent', turns: 1 });
    expect(result.truncated).toBe(true);
    await sleep(100);
    const frame = parseFrame(frames(client)[0])!;
    expect(applyFrame(EMPTY_STREAM, frame, 0).turns.map((t) => t.id)).toEqual(['2']);
  });

  it('PHC-C2 an open ask of the pane is sent before live', async () => {
    const client = await phone(['read', 'notify']);
    await client.call('agent.stream.open', { paneId: 'p-claude' });
    await sleep(100);
    const events = frames(client).flatMap((payload) => payload.events);
    expect(events.slice(-2)).toEqual([{ type: 'ask', askId: 'ask-migration', kind: 'permission' }, { type: 'live' }]);
  });

  it('PHC-C3 a prompt streams its turn live, and agent.stream.close stops the frames', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    await client.call('agent.stream.open', { paneId: 'p-agent' });
    await sleep(100);
    await client.call('agent.prompt', { paneId: 'p-agent', text: 'one more thing' });
    await sleep(100);
    const live = frames(client).filter((payload) => payload.backfill === false);
    expect(live).toHaveLength(1);
    expect(live[0].seq).toBe(2);
    expect(live[0].events.map((e: any) => e.type)).toEqual(['turn.started', 'prompt', 'text', 'turn.ended']);
    expect((await client.call('agent.stream.close', { paneId: 'p-agent' })).result).toEqual({ ok: true });
    expect((await client.call('agent.stream.close', { paneId: 'p-agent' })).result).toEqual({ ok: true });
    await client.call('agent.prompt', { paneId: 'p-agent', text: 'and again' });
    await sleep(100);
    expect(frames(client).filter((payload) => payload.backfill === false)).toHaveLength(1);
  });

  it('PHC-C4 answering an ask tells the stream', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    await client.call('agent.stream.open', { paneId: 'p-claude' });
    await client.call('ask.answer', { askId: 'ask-migration', choiceId: 'allow-once' });
    await sleep(100);
    const events = frames(client).flatMap((payload) => payload.events);
    expect(events).toContainEqual({ type: 'ask.resolved', askId: 'ask-migration', outcome: 'allow-once' });
  });

  it('PHC-C5 refuses what it cannot stream', async () => {
    const client = await phone(['read', 'notify'], { hooksOff: ['p-codex'] });
    const error = async (params: object) => (await client.call('agent.stream.open', params)).error;
    expect(await error({ paneId: 'p-api-zsh' })).toEqual(expect.objectContaining({ code: -32602, message: 'not-an-agent' }));
    expect(await error({ paneId: 'p-gone' })).toEqual(expect.objectContaining({ message: 'not-an-agent' }));
    expect(await error({ paneId: 'p-codex' })).toEqual(expect.objectContaining({ message: 'not-an-agent' }));
    expect(await error({})).toEqual(expect.objectContaining({ message: 'missing paneId' }));
    expect(await error({ paneId: 'p-agent', turns: 51 })).toEqual(expect.objectContaining({ message: 'bad-params' }));
    expect(await error({ paneId: 'p-agent', turns: 0 })).toEqual(expect.objectContaining({ message: 'bad-params' }));
  });

  it('PHC-C5 at most four streams per socket, and opening one again replaces it', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    const { result } = await client.call('agent.start', { sessionId: 's-api', prompt: 'two words' });
    for (const paneId of ['p-agent', 'p-claude', 'p-codex', 'p-dot']) expect((await client.call('agent.stream.open', { paneId })).result.ok).toBe(true);
    expect((await client.call('agent.stream.open', { paneId: result.paneId })).error).toEqual(expect.objectContaining({ code: -32602, message: 'too-many-streams' }));
    expect((await client.call('agent.stream.open', { paneId: 'p-agent' })).result.ok).toBe(true);
  });

  it('PHC-C5 reading the stream needs read', async () => {
    const client = await phone(['notify']);
    expect((await client.call('agent.stream.open', { paneId: 'p-agent' })).error).toEqual(expect.objectContaining({ code: -32003 }));
  });
});
