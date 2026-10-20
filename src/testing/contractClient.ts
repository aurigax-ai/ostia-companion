import { createHash } from 'node:crypto';
import { request } from 'node:https';
import type { TLSSocket } from 'node:tls';
import WebSocket from 'ws';
import { requestPairing } from '../services/pairFlow';
import type { MockGateway } from './mockGateway';

export const PUBKEY = 'MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=';

export function pinnedPost(port: number, fingerprint: string) {
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

export async function pair(gw: MockGateway) {
  let phoneCode = '';
  const result = await requestPairing(
    pinnedPost(gw.port, gw.fingerprint),
    { pairCode: gw.pairCode, fingerprint: gw.fingerprint, deviceName: 'Test phone', pubkey: PUBKEY },
    (code) => (phoneCode = code),
  );
  return { result, phoneCode };
}

export function connect(gw: MockGateway) {
  const socket = new WebSocket(`wss://127.0.0.1:${gw.port}/ws`, { rejectUnauthorized: false });
  let nextId = 1;
  const pending = new Map<number, (message: any) => void>();
  const unsolicited: any[] = [];
  const output: string[] = [];
  let serveRequest: ((method: string, params: any) => { result?: object; error?: object }) | null = null;
  socket.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) return void (data[0] === 0x01 && output.push(data.subarray(1).toString('utf8')));
    const message = JSON.parse(data.toString());
    if (serveRequest && message.method && message.method !== 'event' && message.id != null) {
      return void socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, ...serveRequest(message.method, message.params) }));
    }
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
  const resize = (cols: number, rows: number) =>
    socket.send(Buffer.concat([Buffer.from([0x03]), Buffer.from(JSON.stringify({ paneId: 'p-claude', cols, rows }))]));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
  const serve = (handler: typeof serveRequest) => (serveRequest = handler);
  const notify = (type: string, payload: object) =>
    socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type, payload } }));
  return { socket, call, input, resize, output, unsolicited, closed, settle, serve, notify };
}

