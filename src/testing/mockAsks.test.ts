import { afterEach, describe, expect, it } from 'vitest';
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

  it('AGT-C6 a prompt with an image answers image: pasted and the desktop keeps the image', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    const data = Buffer.alloc(2048, 1).toString('base64');
    expect((await client.call('agent.prompt', { paneId: 'p-agent', text: 'what is this', image: { mime: 'image/png', data } })).result).toEqual({ ok: true, image: 'pasted' });
    expect(gateway!.pasted('p-agent')).toEqual([{ mime: 'image/png', bytes: 2048 }]);
    expect(gateway!.typed('p-agent')).toEqual(['what is this\r']);
  });

  it('AGT-C7 an image that is not PNG, JPEG or WebP, or over 10 MiB, is refused and nothing is typed', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    const small = Buffer.alloc(16).toString('base64');
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
    const refused = [
      await client.call('agent.prompt', { paneId: 'p-agent', text: 'a', image: { mime: 'image/gif', data: small } }),
      await client.call('agent.prompt', { paneId: 'p-agent', text: 'b', image: { mime: 'image/jpeg', data: huge } }),
    ];
    expect(refused.map((reply) => reply.error?.message)).toEqual(['image-type', 'image-too-large']);
    expect(gateway!.typed('p-agent')).toEqual([]);
    expect(gateway!.pasted('p-agent')).toEqual([]);
  });

  it('AGT-C8 the seventh image in a minute is rate-limited', async () => {
    const client = await phone(['read', 'notify', 'respond']);
    const image = { mime: 'image/webp', data: Buffer.alloc(16).toString('base64') };
    for (let i = 0; i < 6; i++) expect((await client.call('agent.prompt', { paneId: 'p-agent', text: `n${i}`, image })).result).toEqual({ ok: true, image: 'pasted' });
    expect((await client.call('agent.prompt', { paneId: 'p-agent', text: 'n7', image })).error).toEqual(expect.objectContaining({ code: -32007, message: 'rate-limited' }));
  });

  it('AGT-C9 an older desktop advertises no image feature and closes a frame over 1 MiB, so a photo drops the socket', async () => {
    const older = await phone(['read', 'notify', 'respond'], { imagesUnsupported: true });
    const photo = { mime: 'image/jpeg', data: Buffer.alloc(2 * 1024 * 1024).toString('base64') };
    older.call('agent.prompt', { paneId: 'p-agent', text: 'look', image: photo });
    expect(await older.closed).toBe(1009);
    expect(gateway!.typed('p-agent')).toEqual([]);
  });

  it('AGT-C9 a desktop with prompt-image advertises it in hello and takes a photo of several MiB', async () => {
    gateway = await startMockGateway({ caps: ['read', 'notify', 'respond'] });
    const { result: paired } = await pair(gateway);
    const client = connect(gateway);
    expect((await client.call('hello', { deviceToken: paired.deviceToken })).result.features).toEqual(['prompt-image']);
    const photo = { mime: 'image/jpeg', data: Buffer.alloc(3 * 1024 * 1024).toString('base64') };
    expect((await client.call('agent.prompt', { paneId: 'p-agent', text: 'look', image: photo })).result).toEqual({ ok: true, image: 'pasted' });
  });

  it('AGT-C9 an older desktop sends no features in hello', async () => {
    gateway = await startMockGateway({ caps: ['read', 'notify', 'respond'], imagesUnsupported: true });
    const { result: paired } = await pair(gateway);
    const client = connect(gateway);
    expect((await client.call('hello', { deviceToken: paired.deviceToken })).result.features).toBeUndefined();
  });

  it('AGT-C9 a frame over 1 MiB before hello closes the socket', async () => {
    gateway = await startMockGateway({ caps: ['read', 'notify', 'respond'] });
    const client = connect(gateway);
    client.call('hello', { deviceToken: 'x'.repeat(2 * 1024 * 1024) });
    expect(await client.closed).toBe(1009);
  });
});
