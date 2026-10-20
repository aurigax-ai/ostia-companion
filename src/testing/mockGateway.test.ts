import { afterEach, describe, expect, it } from 'vitest';
import { pairFailure } from '../services/pairFailure';
import { connect, pair, pinnedPost, PUBKEY } from './contractClient';
import { MockGateway, MockGatewayOptions, startMockGateway } from './mockGateway';

let gateway: MockGateway | null = null;

afterEach(async () => {
  await gateway?.close();
  gateway = null;
});

async function start(options: MockGatewayOptions = {}) {
  gateway = await startMockGateway(options);
  return gateway;
}

describe('mock gateway: pairing (contract §3)', () => {
  it('pairs through the real client flow, and both sides show the same check code', async () => {
    const gw = await start({ caps: ['input', 'read', 'notify'] });
    const { result, phoneCode } = await pair(gw);
    expect(phoneCode).toMatch(/^\d{6}$/);
    expect(gw.checkCodes).toEqual([phoneCode]);
    expect(result.caps).toEqual(['read', 'notify', 'input']);
    expect(gw.devices.map((d) => d.deviceToken)).toEqual([result.deviceToken]);
  });

  it('uses a pairing code once', async () => {
    const gw = await start();
    const used = gw.pairCode;
    await pair(gw);
    const post = pinnedPost(gw.port, gw.fingerprint);
    await expect(post('/pair', { pairCode: used, device: { name: 'x', pubkey: PUBKEY }, commit: 'ab' })).rejects.toThrow(
      /401/,
    );
  });

  it('accepts the code in lowercase with the dash', async () => {
    const gw = await start();
    const code = `${gw.pairCode.slice(0, 4)}-${gw.pairCode.slice(4)}`.toLowerCase();
    const started = await pinnedPost(gw.port, gw.fingerprint)('/pair', { pairCode: code, device: { name: 'x', pubkey: PUBKEY }, commit: 'ab' });
    expect(started.requestId).toEqual(expect.any(String));
  });

  it('answers 403 when the desktop declines, which the phone words as declined', async () => {
    const gw = await start({ decision: 'deny' });
    const error = await pair(gw).catch((err) => err);
    expect(error.message).toMatch(/403/);
    expect(pairFailure(error.message, '10.0.2.2', gw.port).text).toBe('The desktop declined this phone.');
  });

  it('answers 408 when nobody decides within the window', async () => {
    const gw = await start({ decision: 'never', expireMs: 200 });
    await expect(pair(gw)).rejects.toThrow(/408/);
  });

  it('refuses a nonce that does not match the commit, and an unknown request', async () => {
    const gw = await start();
    const post = pinnedPost(gw.port, gw.fingerprint);
    const started = await post('/pair', { pairCode: gw.pairCode, device: { name: 'x', pubkey: PUBKEY }, commit: '00'.repeat(32) });
    await expect(post('/pair/confirm', { requestId: started.requestId, nonce: btoa('nope') })).rejects.toThrow(/400/);
    await expect(post('/pair/confirm', { requestId: 'missing', nonce: btoa('nope') })).rejects.toThrow(/404/);
  });
});

describe('mock gateway: connection (contract §4–§7)', () => {
  it('lists workspaces and panes after hello', async () => {
    const gw = await start();
    const { result } = await pair(gw);
    const client = connect(gw);
    const hello = await client.call('hello', { deviceToken: result.deviceToken, client: 'test' });
    expect(hello.result.caps).toEqual(['read', 'notify']);
    const sessions = await client.call('session.list');
    const panes = await client.call('pane.list', { sessionId: 's-api' });
    expect(sessions.result.sessions.map((s: any) => s.name)).toContain('api-server');
    expect(panes.result.panes.every((p: any) => p.sessionId === 's-api')).toBe(true);
  });

  it('rejects an unknown token with -32001 and closes 4001', async () => {
    const gw = await start();
    const client = connect(gw);
    const hello = await client.call('hello', { deviceToken: 'stolen' });
    expect(hello.error.code).toBe(-32001);
    expect(await client.closed).toBe(4001);
  });

  it('gives an observer the output but answers its keystrokes with needs-elevation', async () => {
    const gw = await start();
    const { result } = await pair(gw);
    const client = connect(gw);
    await client.call('hello', { deviceToken: result.deviceToken });
    const attach = await client.call('pty.attach', { paneId: 'p-claude', role: 'owner', sinceCursor: 0 });
    expect(attach.result.role).toBe('observer');
    expect(client.output.join('')).toMatch(/Apply this migration/);
    client.input('1');
    await client.settle();
    expect(client.unsolicited).toContainEqual(
      expect.objectContaining({ id: null, error: expect.objectContaining({ code: -32003, data: { cap: 'input' } }) }),
    );
  });

  it('lets an owner answer the agent prompt, which moves the session to working', async () => {
    const gw = await start({ caps: ['read', 'notify', 'input'] });
    const { result } = await pair(gw);
    const client = connect(gw);
    await client.call('hello', { deviceToken: result.deviceToken });
    const attach = await client.call('pty.attach', { paneId: 'p-claude', role: 'owner', sinceCursor: 0 });
    expect(attach.result.role).toBe('owner');
    client.input('\x1b[B');
    client.input('\r');
    await client.settle();
    expect(client.output.at(-1)).toMatch(/Yes, and don't ask again/);
    expect(client.unsolicited).toContainEqual(
      expect.objectContaining({ params: { type: 'session.state', payload: { sessionId: 's-api', state: 'working' } } }),
    );
  });

  it('answers a resize frame with resize-not-supported, even from an owner, and keeps the socket open', async () => {
    const gw = await start({ caps: ['read', 'notify', 'input'] });
    const { result } = await pair(gw);
    const client = connect(gw);
    await client.call('hello', { deviceToken: result.deviceToken });
    await client.call('pty.attach', { paneId: 'p-claude', role: 'owner', sinceCursor: 0 });
    client.resize(100, 30);
    await client.settle();
    expect(client.unsolicited).toContainEqual(
      expect.objectContaining({ id: null, error: expect.objectContaining({ code: -32602, message: 'resize-not-supported' }) }),
    );
    expect((await client.call('pane.list', {})).result.panes.length).toBeGreaterThan(0);
  });

  it('returns the pane size on attach and tells an attached phone when the desktop resizes it', async () => {
    const gw = await start();
    const { result } = await pair(gw);
    const client = connect(gw);
    await client.call('hello', { deviceToken: result.deviceToken });
    gw.resizePane('p-claude', 120, 40);
    const attach = await client.call('pty.attach', { paneId: 'p-claude', role: 'observer', sinceCursor: 0 });
    expect(attach.result).toMatchObject({ cols: 120, rows: 40 });
    gw.resizePane('p-claude', 100, 30);
    gw.resizePane('p-claude', 100, 30);
    await client.settle();
    expect(client.unsolicited.filter((m) => m.params?.type === 'pty.size')).toEqual([
      { jsonrpc: '2.0', method: 'event', params: { type: 'pty.size', payload: { paneId: 'p-claude', cols: 100, rows: 30 } } },
    ]);
  });

  it('holds a pane at the phone grid and gives the desktop size back on release, detach and a desktop resize', async () => {
    const gw = await start({ caps: ['read', 'notify', 'input'] });
    const { result } = await pair(gw);
    const client = connect(gw);
    await client.call('hello', { deviceToken: result.deviceToken });
    expect((await client.call('pty.hold', { paneId: 'p-api-zsh', cols: 50, rows: 20 })).error.message).toBe('not-attached');
    await client.call('pty.attach', { paneId: 'p-api-zsh', role: 'owner', sinceCursor: 0 });
    expect((await client.call('pty.hold', { paneId: 'p-api-zsh', cols: 0, rows: 20 })).error.message).toBe('bad-size');
    expect((await client.call('pty.hold', { paneId: 'p-api-zsh', cols: 50, rows: 20 })).result).toEqual({ ok: true, cols: 50, rows: 20 });
    await client.call('pty.hold', { paneId: 'p-api-zsh', cols: 60, rows: 25 });
    expect((await client.call('pty.release', { paneId: 'p-api-zsh' })).result).toEqual({ ok: true });
    gw.resizePane('p-api-zsh', 70, 35);
    await client.call('pty.hold', { paneId: 'p-api-zsh', cols: 40, rows: 10 });
    gw.resizePane('p-api-zsh', 80, 40);
    await client.settle();
    const sizes = client.unsolicited.filter((m) => m.params?.type === 'pty.size').map((m) => [m.params.payload.cols, m.params.payload.rows]);
    expect(sizes).toEqual([[50, 20], [60, 25], [64, 30], [70, 35], [40, 10], [80, 40]]);
    const other = connect(gw);
    await other.call('hello', { deviceToken: result.deviceToken });
    await other.call('pty.attach', { paneId: 'p-api-zsh', role: 'owner', sinceCursor: 0 });
    await client.call('pty.hold', { paneId: 'p-api-zsh', cols: 30, rows: 12 });
    expect((await other.call('pty.hold', { paneId: 'p-api-zsh', cols: 20, rows: 10 })).error.message).toBe('held-by-other');
    await client.call('pty.detach', { paneId: 'p-api-zsh' });
    await other.settle();
    expect((await other.call('pty.attach', { paneId: 'p-api-zsh', role: 'observer', sinceCursor: 0 })).result).toMatchObject({ cols: 80, rows: 40 });
  });

  it('refuses a hold without the input cap', async () => {
    const gw = await start();
    const { result } = await pair(gw);
    const client = connect(gw);
    await client.call('hello', { deviceToken: result.deviceToken });
    await client.call('pty.attach', { paneId: 'p-api-zsh', role: 'observer', sinceCursor: 0 });
    expect((await client.call('pty.hold', { paneId: 'p-api-zsh', cols: 50, rows: 20 })).error).toMatchObject({ code: -32003, data: { cap: 'input' } });
  });

  it('closes 4003 on revoke and 4004 when a cap is removed', async () => {
    const gw = await start({ caps: ['read', 'notify', 'input'] });
    const first = (await pair(gw)).result;
    gw.mintCode();
    const second = (await pair(gw)).result;
    const revoked = connect(gw);
    const narrowed = connect(gw);
    await revoked.call('hello', { deviceToken: first.deviceToken });
    await narrowed.call('hello', { deviceToken: second.deviceToken });
    gw.revoke(first.deviceId);
    gw.setCaps(second.deviceId, ['read', 'notify']);
    expect(await revoked.closed).toBe(4003);
    expect(await narrowed.closed).toBe(4004);
  });
});

describe('mock gateway: rediscovery (contract v1.10)', () => {
  const lan = (port: number) => ({ kind: 'lan' as const, host: '127.0.0.1', port });

  it('sends the address list in hello only after the token passed, and nothing from a v1.9 desktop', async () => {
    const gw = await start({ addresses: [lan(8722)] });
    const { result } = await pair(gw);
    const stranger = connect(gw);
    expect((await stranger.call('hello', { deviceToken: 'nope' })).error.code).toBe(-32001);
    const phone = connect(gw);
    expect((await phone.call('hello', { deviceToken: result.deviceToken })).result.addresses).toEqual([lan(8722)]);

    const old = await startMockGateway();
    const { result: oldResult } = await pair(old);
    const oldPhone = connect(old);
    expect((await oldPhone.call('hello', { deviceToken: oldResult.deviceToken })).result).not.toHaveProperty('addresses');
    await old.close();
  });

  it('sends addresses.changed to every authenticated socket, whatever its caps', async () => {
    const gw = await start({ caps: ['notify'] });
    const { result } = await pair(gw);
    const phone = connect(gw);
    await phone.call('hello', { deviceToken: result.deviceToken });
    const stranger = connect(gw);
    await stranger.call('hello', { deviceToken: 'nope' }).catch(() => {});
    gw.setAddresses([lan(9000)]);
    await phone.settle();
    expect(phone.unsolicited).toContainEqual({
      jsonrpc: '2.0',
      method: 'event',
      params: { type: 'addresses.changed', payload: { addresses: [lan(9000)] } },
    });
    expect(stranger.unsolicited.filter((m) => m.method === 'event')).toEqual([]);
  });

  it('moves to another port with the same certificate, so the token still works there', async () => {
    const gw = await start();
    const { result } = await pair(gw);
    const before = gw.port;
    const moved = await gw.move();
    expect(moved).not.toBe(before);
    expect(gw.payload('127.0.0.1')).toMatchObject({ port: moved, fingerprint: gw.fingerprint });
    const phone = connect(gw);
    expect((await phone.call('hello', { deviceToken: result.deviceToken })).result.deviceId).toBe(result.deviceId);
  });
});
