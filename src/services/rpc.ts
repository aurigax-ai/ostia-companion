import { PinnedWebSocket } from 'websocket-pinning';
import { PairingData } from './storage';

export interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: any;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ServerNotification {
  jsonrpc: '2.0';
  method: 'event';
  params: {
    type: string;
    payload: any;
  };
}

type EventListener = (type: string, payload: any) => void;
type PtyDataListener = (base64Data: string) => void;
type StatusListener = (status: 'connecting' | 'connected' | 'disconnected' | 'error', errorMsg?: string) => void;

class OstiaRpcClient {
  private socket: PinnedWebSocket | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private eventListeners = new Set<EventListener>();
  private ptyListeners = new Set<PtyDataListener>();
  private statusListeners = new Set<StatusListener>();
  
  private pairingData: PairingData | null = null;
  private connectionStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';
  private isAuthenticated = false;
  
  // Reconnection state
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 500; // ms
  private activePaneId: string | null = null;
  private activeRole: 'observer' | 'owner' = 'observer';
  private lastCursor = 0;

  constructor() {}

  public initialize(pairingData: PairingData) {
    this.pairingData = pairingData;
    this.lastCursor = 0;
    this.activePaneId = null;
    this.connect();
  }

  private setStatus(status: 'connecting' | 'connected' | 'disconnected', errorMsg?: string) {
    this.connectionStatus = status;
    const mappedStatus = errorMsg && status === 'disconnected' ? 'error' : status;
    this.statusListeners.forEach(listener => listener(mappedStatus as any, errorMsg));
  }

  public getStatus() {
    return this.connectionStatus;
  }

  public getIsAuthenticated() {
    return this.isAuthenticated;
  }

  public connect() {
    if (!this.pairingData) return;
    this.disconnect();
    
    const host = this.pairingData.gatewayHost;
    const port = this.pairingData.gatewayPort;
    const fingerprint = this.pairingData.pinnedFingerprint;
    const wsUrl = `wss://${host}:${port}/ws`;
    
    this.setStatus('connecting');
    this.isAuthenticated = false;

    this.socket = new PinnedWebSocket(wsUrl, fingerprint, {
      onOpen: () => {
        this.reconnectDelay = 500; // Reset backoff
        this.sendHello();
      },
      onMessage: (event) => {
        if (event.type === 'text') {
          this.handleTextFrame(event.data);
        } else if (event.type === 'binary') {
          this.handleBinaryFrame(event.data);
        }
      },
      onClose: (event) => {
        this.setStatus('disconnected', event.reason || 'WebSocket connection closed');
        this.handleDisconnect();
      },
      onError: (event) => {
        console.warn('PinnedWebSocket Error:', event.message);
        this.statusListeners.forEach(l => l('error', event.message));
      }
    });
  }

  public disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isAuthenticated = false;
    this.setStatus('disconnected');
  }

  private handleDisconnect() {
    this.isAuthenticated = false;
    // Exponential backoff reconnect
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      // Increase delay up to 8s max
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
      this.connect();
    }, this.reconnectDelay);
  }

  private async sendHello() {
    if (!this.pairingData) return;
    try {
      const response = await this.call('hello', {
        deviceToken: this.pairingData.deviceToken,
        client: 'ostia-companion/1.0',
      });
      
      this.isAuthenticated = true;
      this.setStatus('connected');
      console.log('OSTIA_RPC: Handshake successful', response);

      // Re-attach PTY if we were previously attached to a pane
      if (this.activePaneId) {
        this.attachPty(this.activePaneId, this.activeRole, this.lastCursor);
      }
    } catch (e: any) {
      console.error('Handshake hello failed:', e);
      this.setStatus('disconnected', e.message || 'Authentication failed');
      // If unauthenticated error code is returned, maybe forget pairing
      if (e.code === -32001) {
        this.disconnect(); // Do not auto-reconnect if token is revoked
      }
    }
  }

  private handleTextFrame(data: string) {
    try {
      const payload = JSON.parse(data);
      
      // 1. JSON-RPC Response
      if (payload.id !== undefined) {
        const pending = this.pendingRequests.get(payload.id);
        if (pending) {
          this.pendingRequests.delete(payload.id);
          if (payload.error) {
            pending.reject(payload.error);
          } else {
            pending.resolve(payload.result);
          }
        }
      } 
      // 2. Server Notification Event
      else if (payload.method === 'event' && payload.params) {
        const { type, payload: eventPayload } = payload.params;
        
        // Handle lastCursor updates from cursor event notifications to resume cleanly
        if (type === 'pane.state' && eventPayload?.paneId === this.activePaneId) {
          if (eventPayload.blockCount !== undefined) {
            // Placeholder/rough sync if cursor is not directly exposed in metadata
          }
        }
        
        this.eventListeners.forEach(listener => listener(type, eventPayload));
      }
    } catch (e) {
      console.error('Failed to parse text frame JSON:', e);
    }
  }

  private handleBinaryFrame(base64Data: string) {
    try {
      const binaryString = atob(base64Data);
      if (binaryString.length === 0) return;
      const typeByte = binaryString.charCodeAt(0);

      // 0x01: Server -> Client Raw PTY output bytes
      if (typeByte === 0x01) {
        // Strip the type byte and forward the remainder as Base64 to xterm.js WebView
        const payloadBase64 = btoa(binaryString.substring(1));
        this.ptyListeners.forEach(listener => listener(payloadBase64));
      } 
      // 0x00: Server -> Client Control JSON (e.g. cursor or resize metadata)
      else if (typeByte === 0x00) {
        const jsonStr = decodeUtf8(binaryString.substring(1));
        const control = JSON.parse(jsonStr);
        if (control.kind === 'cursor' && control.cursor !== undefined) {
          this.lastCursor = control.cursor;
        }
        this.eventListeners.forEach(l => l(`pty.${control.kind}`, control));
      }
    } catch (e) {
      console.error('Failed to decode binary frame:', e);
    }
  }

  /**
   * Sends a JSON-RPC 2.0 request over the text channel.
   */
  public call(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.connectionStatus !== 'connected' && method !== 'hello') {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      const id = this.nextId++;
      const request: RpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });
      
      try {
        this.socket?.send(JSON.stringify(request));
      } catch (e) {
        this.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  // === PTY Methods ===

  public async attachPty(paneId: string, role: 'observer' | 'owner' = 'observer', sinceCursor = 0) {
    this.activePaneId = paneId;
    this.activeRole = role;
    this.lastCursor = sinceCursor;
    
    return this.call('pty.attach', {
      paneId,
      role,
      sinceCursor,
    });
  }

  public async detachPty(paneId: string) {
    if (this.activePaneId === paneId) {
      this.activePaneId = null;
    }
    return this.call('pty.detach', { paneId });
  }

  /**
   * Sends keystrokes to the active PTY session.
   */
  public sendKeystroke(data: string) {
    if (!this.socket || this.connectionStatus !== 'connected') return;
    
    // Binary Frame 0x02: Client -> Server Raw input bytes
    const frameContent = String.fromCharCode(0x02) + data;
    this.socket.sendBinary(btoa(frameContent));
  }

  /**
   * Sends terminal resize command to the server.
   */
  public sendResize(paneId: string, cols: number, rows: number) {
    if (!this.socket || this.connectionStatus !== 'connected') return;
    
    // Binary Frame 0x03: Client -> Server Resize
    const jsonStr = JSON.stringify({ paneId, cols, rows });
    const frameContent = String.fromCharCode(0x03) + jsonStr;
    this.socket.sendBinary(btoa(frameContent));
  }

  // === Event Subscriptions ===

  public addEventListener(listener: EventListener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  public addPtyListener(listener: PtyDataListener) {
    this.ptyListeners.add(listener);
    return () => this.ptyListeners.delete(listener);
  }

  public addStatusListener(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
}

/**
 * Basic pure JS UTF-8 decoder.
 */
function decodeUtf8(str: string): string {
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str; // Fallback
  }
}

export const OstiaRpc = new OstiaRpcClient();
