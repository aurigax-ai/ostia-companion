import { EventEmitter } from 'expo-modules-core';
import WebSocketPinning from './src/WebSocketPinning';

const emitter: any = new EventEmitter(WebSocketPinning as any);

export interface WebSocketEventMap {
  onOpen: () => void;
  onMessage: (event: { type: 'text' | 'binary'; data: string }) => void;
  onClose: (event: { code: number; reason: string }) => void;
  onError: (event: { message: string }) => void;
}

export class PinnedWebSocket {
  private subscriptions: any[] = [];

  constructor(
    private url: string,
    private fingerprint: string,
    private listeners: Partial<WebSocketEventMap>
  ) {
    this.setupListeners();
    WebSocketPinning.connect(this.url, this.fingerprint);
  }

  private setupListeners() {
    if (this.listeners.onOpen) {
      this.subscriptions.push(emitter.addListener('onOpen', this.listeners.onOpen));
    }
    if (this.listeners.onMessage) {
      this.subscriptions.push(emitter.addListener('onMessage', this.listeners.onMessage));
    }
    if (this.listeners.onClose) {
      this.subscriptions.push(emitter.addListener('onClose', this.listeners.onClose));
    }
    if (this.listeners.onError) {
      this.subscriptions.push(emitter.addListener('onError', this.listeners.onError));
    }
  }

  send(message: string) {
    WebSocketPinning.send(message);
  }

  sendBinary(base64Data: string) {
    WebSocketPinning.sendBinary(base64Data);
  }

  close() {
    try {
      WebSocketPinning.close();
    } catch (e) {
      console.warn('Error closing native websocket:', e);
    }
    this.subscriptions.forEach((sub) => sub.remove());
    this.subscriptions = [];
  }
}

/**
 * Perform an HTTP POST request to a server with self-signed certificate pinning (TOFU).
 * @param url The endpoint URL (e.g. 'https://192.168.1.100:8722/pair')
 * @param body The JSON body object
 * @param fingerprint The expected certificate SHA-256 fingerprint (e.g. 'sha256/...')
 */
export async function pinnedPost(url: string, body: object, fingerprint: string): Promise<any> {
  const bodyString = JSON.stringify(body);
  const responseText = await WebSocketPinning.post(url, bodyString, fingerprint);
  try {
    return JSON.parse(responseText);
  } catch (e) {
    return responseText;
  }
}
