import { PinnedWebSocket } from 'websocket-pinning';
import { PairingData } from './storage';

export type Cap = 'read' | 'notify' | 'command' | 'input' | 'destructive';
export type Role = 'observer' | 'owner';
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'revoked';

export interface RpcError {
  code: number;
  message: string;
  data?: any;
}

export interface AttachResult {
  cursor: number;
  dropped: boolean;
  cols: number;
  rows: number;
  role: Role;
}

type EventListener = (type: string, payload: any) => void;
type PtyDataListener = (base64Data: string) => void;
type StatusListener = (status: ConnectionStatus, reason?: string) => void;
type CapsListener = (caps: Cap[]) => void;

const CLOSE_REVOKED = 4003;
const CLOSE_CAPS_CHANGED = 4004;
const RPC_UNAUTHENTICATED = -32001;
const MIN_RECONNECT_DELAY = 500;
const MAX_RECONNECT_DELAY = 8000;

class OstiaRpcClient {
  private socket: PinnedWebSocket | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private eventListeners = new Set<EventListener>();
  private ptyListeners = new Set<PtyDataListener>();
  private statusListeners = new Set<StatusListener>();
  private capsListeners = new Set<CapsListener>();

  private pairingData: PairingData | null = null;
  private status: ConnectionStatus = 'disconnected';
  private caps: Cap[] = [];

  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = MIN_RECONNECT_DELAY;

  private activePaneId: string | null = null;
  private requestedRole: Role = 'observer';
  private lastCursor = 0;
  private awaitingAttach = false;
  private replayFrames: string[] = [];

  public initialize(pairingData: PairingData) {
    this.pairingData = pairingData;
    this.activePaneId = null;
    this.lastCursor = 0;
    this.connect();
  }

  public getStatus() {
    return this.status;
  }

  public getCaps() {
    return this.caps;
  }

  public hasCap(cap: Cap) {
    return this.caps.includes(cap);
  }

  private setStatus(status: ConnectionStatus, reason?: string) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status, reason));
  }

  private setCaps(caps: Cap[]) {
    this.caps = caps;
    this.capsListeners.forEach((listener) => listener(caps));
  }

  public connect() {
    if (!this.pairingData) return;
    this.closeSocket();

    const { gatewayHost, gatewayPort, pinnedFingerprint } = this.pairingData;
    this.setStatus('connecting');

    const socket: PinnedWebSocket = new PinnedWebSocket(
      `wss://${gatewayHost}:${gatewayPort}/ws`,
      pinnedFingerprint,
      {
        onOpen: () => {
          if (this.socket !== socket) return;
          this.sendHello();
        },
        onMessage: (event) => {
          if (this.socket !== socket) return;
          if (event.type === 'text') this.handleTextFrame(event.data);
          else this.handleBinaryFrame(event.data);
        },
        onClose: (event) => {
          if (this.socket !== socket) return;
          this.handleClose(event.code, event.reason);
        },
        onError: (event) => {
          if (this.socket !== socket) return;
          console.warn('PinnedWebSocket error:', event.message);
        },
      }
    );
    this.socket = socket;
  }

  public disconnect() {
    this.closeSocket();
    this.activePaneId = null;
    this.setStatus('disconnected');
  }

  private closeSocket() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.rejectPending('WebSocket closed');
    this.awaitingAttach = false;
    this.replayFrames = [];
  }

  private rejectPending(message: string) {
    const pending = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    pending.forEach(({ reject }) => reject({ code: -1, message }));
  }

  private handleClose(code: number, reason: string) {
    this.socket = null;
    this.rejectPending(reason || 'WebSocket closed');
    this.awaitingAttach = false;
    this.replayFrames = [];

    if (code === CLOSE_REVOKED) {
      this.revoke('This device was removed on the desktop.');
      return;
    }

    this.setStatus('disconnected', reason || undefined);
    const delay = code === CLOSE_CAPS_CHANGED ? 0 : this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private revoke(reason: string) {
    this.closeSocket();
    this.pairingData = null;
    this.activePaneId = null;
    this.setCaps([]);
    this.setStatus('revoked', reason);
  }

  private async sendHello() {
    if (!this.pairingData) return;
    try {
      const result = await this.call('hello', {
        deviceToken: this.pairingData.deviceToken,
        client: 'ostia-companion/1.0',
      });
      this.reconnectDelay = MIN_RECONNECT_DELAY;
      this.setCaps(result.caps ?? []);
      this.setStatus('connected');
      if (this.activePaneId) {
        this.attachPty(this.activePaneId, this.requestedRole).catch((err) =>
          console.warn('Re-attach after reconnect failed:', err)
        );
      }
    } catch (err: any) {
      if (err?.code === RPC_UNAUTHENTICATED) {
        this.revoke('The desktop no longer accepts this device.');
      }
    }
  }

  private handleTextFrame(data: string) {
    let message: any;
    try {
      message = JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse text frame JSON:', e);
      return;
    }

    if (message.method === 'event' && message.params) {
      const { type, payload } = message.params;
      if (type === 'caps.changed') this.setCaps(payload?.caps ?? []);
      this.emit(type, payload);
      return;
    }

    if (message.id === null && message.error) {
      this.emit('rpc.error', message.error);
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) return;
    this.pendingRequests.delete(message.id);
    if (message.error) pending.reject(message.error);
    else pending.resolve(message.result);
  }

  private handleBinaryFrame(base64Data: string) {
    const binary = atob(base64Data);
    if (binary.length === 0 || binary.charCodeAt(0) !== 0x01) return;
    const payload = binary.substring(1);

    if (this.awaitingAttach) {
      this.replayFrames.push(payload);
      return;
    }
    this.lastCursor += utf16Length(payload);
    this.writePty(payload);
  }

  private writePty(binaryPayload: string) {
    const base64 = btoa(binaryPayload);
    this.ptyListeners.forEach((listener) => listener(base64));
  }

  private emit(type: string, payload: any) {
    this.eventListeners.forEach((listener) => listener(type, payload));
  }

  public call(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || (this.status !== 'connected' && method !== 'hello')) {
        reject({ code: -1, message: 'Not connected to the desktop' });
        return;
      }
      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      } catch (e: any) {
        this.pendingRequests.delete(id);
        reject({ code: -1, message: e?.message ?? 'Send failed' });
      }
    });
  }

  public async attachPty(paneId: string, role: Role): Promise<AttachResult> {
    const sinceCursor = paneId === this.activePaneId ? this.lastCursor : 0;
    this.activePaneId = paneId;
    this.requestedRole = role;
    this.awaitingAttach = true;
    this.replayFrames = [];

    try {
      const result: AttachResult = await this.call('pty.attach', { paneId, role, sinceCursor });
      const replay = this.replayFrames;
      this.awaitingAttach = false;
      this.replayFrames = [];
      this.lastCursor = result.cursor;
      this.emit('pty.attached', result);
      replay.forEach((frame) => this.writePty(frame));
      return result;
    } catch (err) {
      this.awaitingAttach = false;
      this.replayFrames = [];
      throw err;
    }
  }

  public async detachPty(paneId: string) {
    if (this.activePaneId !== paneId) return;
    this.activePaneId = null;
    this.lastCursor = 0;
    if (this.status === 'connected') await this.call('pty.detach', { paneId });
  }

  public sendKeystroke(text: string) {
    this.sendInput(btoa(encodeUtf8(text)));
  }

  public sendInput(base64: string) {
    if (!this.socket || this.status !== 'connected') return;
    this.socket.sendBinary(btoa(String.fromCharCode(0x02) + atob(base64)));
  }

  public sendResize(paneId: string, cols: number, rows: number) {
    if (!this.socket || this.status !== 'connected') return;
    const frame = String.fromCharCode(0x03) + JSON.stringify({ paneId, cols, rows });
    this.socket.sendBinary(btoa(frame));
  }

  public addEventListener(listener: EventListener) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public addPtyListener(listener: PtyDataListener) {
    this.ptyListeners.add(listener);
    return () => {
      this.ptyListeners.delete(listener);
    };
  }

  public addStatusListener(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public addCapsListener(listener: CapsListener) {
    this.capsListeners.add(listener);
    return () => {
      this.capsListeners.delete(listener);
    };
  }
}

export function utf16Length(utf8Binary: string): number {
  let length = 0;
  for (let i = 0; i < utf8Binary.length; i++) {
    const byte = utf8Binary.charCodeAt(i);
    if ((byte & 0xc0) === 0x80) continue;
    length += byte >= 0xf0 ? 2 : 1;
  }
  return length;
}

function encodeUtf8(text: string): string {
  return unescape(encodeURIComponent(text));
}

export const OstiaRpc = new OstiaRpcClient();
