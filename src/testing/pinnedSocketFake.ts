import { createHash } from 'node:crypto';
import type { PeerCertificate } from 'node:tls';
import WebSocket from 'ws';

export interface Attempt {
  url: string;
  sent: string[];
  opened: boolean;
}

export const attempts: Attempt[] = [];
export const trusted: string[] = [];

function fingerprintOf(der: Buffer): string {
  return `sha256/${createHash('sha256').update(der).digest('base64')}`;
}

interface Listeners {
  onOpen?: () => void;
  onMessage?: (event: { type: 'text' | 'binary'; data: string }) => void;
  onClose?: (event: { code: number; reason: string }) => void;
  onError?: (event: { message: string }) => void;
}

export class PinnedWebSocket {
  private socket: WebSocket;
  private attempt: Attempt;
  private done = false;

  constructor(url: string, fingerprint: string, listeners: Listeners) {
    this.attempt = { url, sent: [], opened: false };
    attempts.push(this.attempt);
    this.socket = new WebSocket(url, {
      ca: trusted,
      checkServerIdentity: (_host: string, cert: PeerCertificate) =>
        fingerprintOf(cert.raw) === fingerprint ? undefined : new Error('Certificate fingerprint mismatch'),
    } as unknown as WebSocket.ClientOptions);
    this.socket.on('open', () => {
      this.attempt.opened = true;
      if (!this.done) listeners.onOpen?.();
    });
    this.socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (this.done) return;
      listeners.onMessage?.(isBinary ? { type: 'binary', data: data.toString('base64') } : { type: 'text', data: data.toString() });
    });
    this.socket.on('error', (error) => !this.done && listeners.onError?.({ message: error.message }));
    this.socket.on('close', (code, reason) => {
      if (this.done) return;
      this.done = true;
      listeners.onClose?.({ code, reason: reason.toString() });
    });
  }

  private fail(listeners: Listeners, message: string) {
    if (this.done) return;
    this.done = true;
    listeners.onError?.({ message });
    listeners.onClose?.({ code: 1006, reason: message });
  }

  send(message: string) {
    this.attempt.sent.push(message);
    this.socket.send(message);
  }

  sendBinary(base64: string) {
    this.attempt.sent.push(base64);
    this.socket.send(Buffer.from(base64, 'base64'));
  }

  close() {
    this.done = true;
    this.socket.terminate();
  }
}
