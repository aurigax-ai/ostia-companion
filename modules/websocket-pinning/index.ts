import { EventEmitter } from 'expo-modules-core';
import WebSocketPinning from './src/WebSocketPinning';

const emitter: any = new EventEmitter(WebSocketPinning as any);

export interface WebSocketEventMap {
  onOpen: () => void;
  onMessage: (event: { type: 'text' | 'binary'; data: string }) => void;
  onClose: (event: { code: number; reason: string }) => void;
  onError: (event: { message: string }) => void;
}

let nextSocketId = 1;

export class PinnedWebSocket {
  private subscriptions: any[] = [];
  private id = nextSocketId++;

  constructor(
    private url: string,
    private fingerprint: string,
    private listeners: Partial<WebSocketEventMap>
  ) {
    this.setupListeners();
    WebSocketPinning.connect(this.url, this.fingerprint, this.id);
  }

  private listen(name: string, handler: (event: any) => void) {
    this.subscriptions.push(
      emitter.addListener(name, (event: any) => {
        if (event?.id === this.id) handler(event);
      })
    );
  }

  private setupListeners() {
    if (this.listeners.onOpen) {
      this.listen('onOpen', this.listeners.onOpen);
    }
    if (this.listeners.onMessage) {
      this.listen('onMessage', this.listeners.onMessage);
    }
    if (this.listeners.onClose) {
      this.listen('onClose', this.listeners.onClose);
    }
    if (this.listeners.onError) {
      this.listen('onError', this.listeners.onError);
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
      WebSocketPinning.close(this.id);
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

/** Cancel every pinned POST still waiting for an answer; each one rejects. */
export function cancelPosts(): void {
  WebSocketPinning.cancelPosts();
}
