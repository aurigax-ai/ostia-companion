import { createHash } from 'node:crypto';
import { request } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { pairFailure } from '../services/pairFailure';
import { requestPairing } from '../services/pairFlow';
import { MockGateway, MockGatewayOptions, startMockGateway } from './mockGateway';

const PUBKEY = 'MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=';

let gateway: MockGateway | null = null;

afterEach(async () => {
  await gateway?.close();
  gateway = null;
});

async function start(options: MockGatewayOptions = {}) {
  gateway = await startMockGateway(options);
  return gateway;
}

function pinnedPost(port: number, fingerprint: string) {
  return (path: string, body: object) =>
    new Promise<any>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path, method: 'POST', rejectUnauthorized: false, headers: { 'Content-Type': 'application/json' } },
        (res) => {
          const der = (res.socket as TLSSocket).getPeerCertificate().raw;
          if (`sha256/${createHash('sha256').update(der).digest('base64')}` !== fingerprint) {
            return reject(new Error('Certificate fingerprint mismatch'));
          }
          let text = '';
          res.on('data', (chunk) => (text += chunk));
          res.on('end', () =>
            res.statusCode === 200 ? resolve(JSON.parse(text)) : reject(new Error(`HTTP status code: ${res.statusCode}`)),
          );
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
}

async function pair(gw: MockGateway) {
  let phoneCode = '';
  const result = await requestPairing(
    pinnedPost(gw.port, gw.fingerprint),
    { pairCode: gw.pairCode, fingerprint: gw.fingerprint, deviceName: 'Test phone', pubkey: PUBKEY },
    (code) => (phoneCode = code),
  );
  return { result, phoneCode };
}

function connect(gw: MockGateway) {
  const socket = new WebSocket(`wss://127.0.0.1:${gw.port}/ws`, { rejectUnauthorized: false });
  let nextId = 1;
  const pending = new Map<number, (message: any) => void>();
  const unsolicited: any[] = [];
  const output: string[] = [];
  socket.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) return void (data[0] === 0x01 && output.push(data.subarray(1).toString('utf8')));
    const message = JSON.parse(data.toString());
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    } else unsolicited.push(message);
  });
  const opened = new Promise<void>((resolve) => socket.on('open', () => resolve()));
  const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));
  const call = async (method: string, params: object = {}) => {
    await opened;
    const id = nextId++;
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    return new Promise<any>((resolve) => pending.set(id, resolve));
  };
  const input = (text: string) => socket.send(Buffer.concat([Buffer.from([0x02]), Buffer.from(text)]));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
  return { socket, call, input, output, unsolicited, closed, settle };
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
