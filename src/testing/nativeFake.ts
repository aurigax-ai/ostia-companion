import { createHash } from 'node:crypto';
import { EventEmitter as NodeEmitter } from 'node:events';
import type { PeerCertificate } from 'node:tls';
import WebSocket from 'ws';

export interface Attempt {
  url: string;
  id: number;
  sent: string[];
  opened: boolean;
  deaf?: boolean;
  delayMs?: number;
}

export const attempts: Attempt[] = [];
export const trusted: string[] = [];
export const behavior = { silent: new Set<string>(), errorOnly: new Set<string>(), deaf: new Set<string>(), slow: new Map<string, number>() };

const bus = new NodeEmitter();
const sockets = new Map<number, WebSocket>();
let current = 0;

const fingerprintOf = (der: Buffer) => `sha256/${createHash('sha256').update(der).digest('base64')}`;
const emit = (name: string, id: number, payload: object = {}) => bus.emit(name, { id, ...payload });

export const emitter = {
  addListener(name: string, listener: (event: any) => void) {
    bus.on(name, listener);
    return { remove: () => bus.off(name, listener) };
  },
};

export const nativeModule = {
  connect(url: string, fingerprint: string, id: number) {
    current = id;
    const attempt: Attempt = { url, id, sent: [], opened: false };
    attempts.push(attempt);
    const host = new URL(url).host;
    if (behavior.silent.has(host)) return;
    if (behavior.deaf.has(host)) {
      attempt.deaf = true;
      return void queueMicrotask(() => {
        attempt.opened = true;
        emit('onOpen', id);
      });
    }
    if (behavior.errorOnly.has(host)) return void queueMicrotask(() => emit('onError', id, { message: 'handshake failed' }));
    const socket = new WebSocket(url, {
      ca: trusted,
      checkServerIdentity: (_host: string, cert: PeerCertificate) =>
        fingerprintOf(cert.raw) === fingerprint ? undefined : new Error('Certificate fingerprint mismatch'),
    } as unknown as WebSocket.ClientOptions);
    sockets.set(id, socket);
    let failed = false;
    attempt.delayMs = behavior.slow.get(host);
    socket.on('open', () => {
      attempt.opened = true;
      if (attempt.delayMs) setTimeout(() => emit('onOpen', id), attempt.delayMs);
      else emit('onOpen', id);
    });
    socket.on('message', (data: Buffer, isBinary: boolean) =>
      emit('onMessage', id, isBinary ? { type: 'binary', data: data.toString('base64') } : { type: 'text', data: data.toString() }),
    );
    socket.on('error', (error) => {
      failed = true;
      emit('onError', id, { message: error.message });
      emit('onClose', id, { code: 1006, reason: error.message });
    });
    socket.on('close', (code, reason) => !failed && emit('onClose', id, { code, reason: reason.toString() }));
  },
  send(message: string) {
    const attempt = attempts.find((a) => a.id === current);
    attempt?.sent.push(message);
    if (attempt?.deaf) return;
    const socket = sockets.get(current);
    if (attempt?.delayMs) setTimeout(() => socket?.send(message), attempt.delayMs);
    else socket?.send(message);
  },
  sendBinary(base64: string) {
    attempts.find((a) => a.id === current)?.sent.push(base64);
    sockets.get(current)?.send(Buffer.from(base64, 'base64'));
  },
  close(id: number) {
    if (id === current) sockets.get(id)?.terminate();
  },
  post: async () => '',
  cancelPosts() {},
};

export function lateEvent(name: string, id: number, payload: object = {}) {
  emit(name, id, payload);
}

export function reset() {
  attempts.length = 0;
  trusted.length = 0;
  behavior.silent.clear();
  behavior.errorOnly.clear();
  behavior.deaf.clear();
  behavior.slow.clear();
  sockets.forEach((socket) => socket.terminate());
  sockets.clear();
  bus.removeAllListeners();
}

export function listenerCount(): number {
  return ['onOpen', 'onMessage', 'onClose', 'onError'].reduce((sum, name) => sum + bus.listenerCount(name), 0);
}
