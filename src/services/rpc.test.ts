import { beforeEach, describe, expect, it, vi } from 'vitest';

const sockets: FakeSocket[] = [];

class FakeSocket {
  sent: string[] = [];
  constructor(
    public url: string,
    public fingerprint: string,
    public listeners: { onOpen?: () => void; onMessage?: (event: { type: 'text' | 'binary'; data: string }) => void; onClose?: (event: { code: number; reason: string }) => void },
  ) {
    sockets.push(this);
  }
  send(message: string) {
    this.sent.push(message);
  }
  sendBinary() {}
  close() {}
  reply(id: number, result: object) {
    this.listeners.onMessage?.({ type: 'text', data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
  }
  output(text: string) {
    this.listeners.onMessage?.({ type: 'binary', data: btoa(String.fromCharCode(1) + text) });
  }
  methods() {
    return this.sent.map((message) => JSON.parse(message).method as string);
  }
  idOf(method: string, nth = 0) {
    return this.sent.map((message) => JSON.parse(message)).filter((message) => message.method === method)[nth].id as number;
  }
}

vi.mock('websocket-pinning', () => ({ PinnedWebSocket: FakeSocket }));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function connected() {
  vi.resetModules();
  sockets.length = 0;
  const { OstiaRpc } = await import('./rpc');
  OstiaRpc.initialize({ gatewayHost: 'h', gatewayPort: 1, pinnedFingerprint: 'f', deviceToken: 't' } as never);
  const socket = sockets[0];
  socket.listeners.onOpen?.();
  await tick();
  socket.reply(socket.idOf('hello'), { caps: ['read', 'input'] });
  await tick();
  return { OstiaRpc, socket };
}

describe('pty attach', () => {
  beforeEach(() => vi.resetModules());

  it('CRD-R1 switching panes detaches the old one and drops its late output before the new attach starts', async () => {
    const { OstiaRpc, socket } = await connected();
    const received: string[] = [];
    OstiaRpc.addPtyListener((base64) => received.push(atob(base64)));
    const first = OstiaRpc.attachPty('old', 'owner');
    await tick();
    socket.reply(socket.idOf('pty.attach'), { cursor: 0, dropped: false, cols: 80, rows: 24, role: 'owner' });
    await first;
    const detaching = OstiaRpc.detachPty('old');
    const second = OstiaRpc.attachPty('new', 'owner');
    await tick();
    socket.output('late output of the old pane');
    expect(socket.methods().filter((m) => m === 'pty.attach')).toHaveLength(1);
    socket.reply(socket.idOf('pty.detach'), {});
    await detaching;
    await tick();
    expect(socket.methods().slice(-2)).toEqual(['pty.detach', 'pty.attach']);
    socket.output('replay of the new pane');
    socket.reply(socket.idOf('pty.attach', 1), { cursor: 22, dropped: false, cols: 80, rows: 24, role: 'owner' });
    await second;
    expect(received).toEqual(['replay of the new pane']);
  });

  it('CRD-R2 the attached event names the pane it is for', async () => {
    const { OstiaRpc, socket } = await connected();
    const events: { type: string; payload: { paneId?: string } }[] = [];
    OstiaRpc.addEventListener((type, payload) => events.push({ type, payload }));
    const attach = OstiaRpc.attachPty('p1', 'observer');
    await tick();
    socket.reply(socket.idOf('pty.attach'), { cursor: 0, dropped: false, cols: 80, rows: 24, role: 'observer' });
    await attach;
    expect(events.find((e) => e.type === 'pty.attached')?.payload.paneId).toBe('p1');
  });

  it('CRD-R3 sends hold and release as requests', async () => {
    const { OstiaRpc, socket } = await connected();
    void OstiaRpc.holdPty('p1', 50, 20);
    void OstiaRpc.releasePty('p1');
    await tick();
    const sent = socket.sent.map((m) => JSON.parse(m)).filter((m) => m.method === 'pty.hold' || m.method === 'pty.release');
    expect(sent.map((m) => [m.method, m.params])).toEqual([
      ['pty.hold', { paneId: 'p1', cols: 50, rows: 20 }],
      ['pty.release', { paneId: 'p1' }],
    ]);
  });
});
