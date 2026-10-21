import { PinnedWebSocket } from 'websocket-pinning';
import { parsePhoneWorkspace, PhoneWorkspace } from '../model/agentStart';
import { DesktopAddress, parseAddresses, Route, savedRoutes, untried } from '../model/rediscovery';
import { parsePushConfig, PushConfig } from '../model/push';
import { candidateTimeout, nextDelay, delayCap, nextScan, scanDue, timing } from '../model/reconnectPolicy';
import { isActive, onActive } from './appActive';
import { discoverPairedRoutes, onLocalNetwork } from './lanDiscovery';
import { PairingData, saveRoute } from './storage';

export type Cap = 'read' | 'notify' | 'respond' | 'command' | 'input' | 'destructive';
export type Role = 'observer' | 'owner';
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'revoked';

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
type FeaturesListener = () => void;

type Feature = 'prompt-image';
const NO_FEATURES: Feature[] = [];

const CLOSE_REVOKED = 4003;
const CLOSE_CAPS_CHANGED = 4004;
const RPC_UNAUTHENTICATED = -32001;

class OstiaRpcClient {
  private socket: PinnedWebSocket | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private eventListeners = new Set<EventListener>();
  private ptyListeners = new Set<PtyDataListener>();
  private statusListeners = new Set<StatusListener>();
  private capsListeners = new Set<CapsListener>();
  private featuresListeners = new Set<FeaturesListener>();

  private pairingData: PairingData | null = null;
  private status: ConnectionStatus = 'disconnected';
  private caps: Cap[] = [];
  private features: Feature[] = NO_FEATURES;
  private phoneWorkspace: PhoneWorkspace | null = null;
  private pushConfig: PushConfig | null = null;
  private pushListeners = new Set<() => void>();

  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = timing.minDelayMs;
  private run = 0;
  private cycleFailed = false;
  private scanAt = 0;
  private scanDelay = timing.minScanDelayMs;
  private resumeOnActive = false;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    onActive(() => {
      if (!this.resumeOnActive) return;
      this.resumeOnActive = false;
      this.retry();
    });
  }

  private activePaneId: string | null = null;
  private requestedRole: Role = 'observer';
  private lastCursor = 0;
  private awaitingAttach = false;
  private detaching: Promise<unknown> = Promise.resolve();
  private replayFrames: string[] = [];

  public initialize(pairingData: PairingData) {
    this.pairingData = pairingData;
    this.setPush(null);
    this.activePaneId = null;
    this.lastCursor = 0;
    this.connect();
  }

  public getPairing() {
    return this.pairingData;
  }

  public getStatus() {
    return this.status;
  }

  public getCaps() {
    return this.caps;
  }

  public getFeatures() {
    return this.features;
  }

  public getPhoneWorkspace() {
    return this.phoneWorkspace;
  }

  public getPush() {
    return this.pushConfig;
  }

  public addPushListener(listener: () => void) {
    this.pushListeners.add(listener);
    return () => {
      this.pushListeners.delete(listener);
    };
  }

  private setPush(config: PushConfig | null) {
    this.pushConfig = config;
    this.pushListeners.forEach((listener) => listener());
  }

  public hasCap(cap: Cap) {
    return this.caps.includes(cap);
  }

  private setStatus(status: ConnectionStatus, reason?: string) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status, reason));
  }

  private setFeatures(features: Feature[]) {
    this.features = features.length > 0 ? features : NO_FEATURES;
    this.featuresListeners.forEach((listener) => listener());
  }

  private setCaps(caps: Cap[]) {
    this.caps = caps;
    this.capsListeners.forEach((listener) => listener(caps));
  }

  public connect() {
    if (!this.pairingData) return;
    this.closeSocket();
    this.setStatus('connecting');
    this.tryRoutes(this.run, savedRoutes(this.pairingData), [], false);
  }

  private tryRoutes(run: number, queue: Route[], tried: Route[], discovered: boolean) {
    if (run !== this.run || !this.pairingData) return;
    const route = queue[0];
    if (route) {
      this.open(route, () => this.tryRoutes(run, queue.slice(1), [...tried, route], discovered));
      return;
    }
    if (discovered || !scanDue(Date.now(), this.scanAt)) {
      this.unreachable();
      return;
    }
    this.scanLan()
      .catch((): Route[] => [])
      .then((found) => this.tryRoutes(run, untried(found, tried), tried, true));
  }

  private async scanLan(): Promise<Route[]> {
    if (!(await onLocalNetwork())) return [];
    const next = nextScan(Date.now(), this.scanDelay);
    this.scanAt = next.scanAt;
    this.scanDelay = next.scanDelay;
    return discoverPairedRoutes();
  }

  private unreachable() {
    this.cycleFailed = true;
    if (isActive()) {
      this.handleClose(1006, 'The desktop is not reachable.');
      return;
    }
    this.socket = null;
    this.resumeOnActive = true;
    this.setStatus('disconnected', 'The desktop is not reachable.');
  }

  private open(route: Route, failed: () => void) {
    if (!this.pairingData) return;
    let opened = false;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      if (this.socket !== socket) return;
      this.clearAttemptTimer();
      this.socket = null;
      socket.close();
      this.rejectPending('The desktop did not answer.');
      failed();
    };
    this.attemptTimer = setTimeout(fail, candidateTimeout(route.kind));

    const socket: PinnedWebSocket = new PinnedWebSocket(
      `wss://${route.host}:${route.port}/ws`,
      this.pairingData.pinnedFingerprint,
      {
        onOpen: () => {
          if (this.socket !== socket) return;
          opened = true;
          this.clearAttemptTimer();
          this.attemptTimer = setTimeout(fail, timing.candidateMs);
          this.sendHello(route);
        },
        onMessage: (event) => {
          if (this.socket !== socket) return;
          if (event.type === 'text') this.handleTextFrame(event.data);
          else this.handleBinaryFrame(event.data);
        },
        onClose: (event) => {
          if (this.socket !== socket) return;
          if (opened) {
            socket.close();
            this.handleClose(event.code, event.reason);
            return;
          }
          fail();
        },
        onError: (event) => {
          if (this.socket !== socket) return;
          console.warn('PinnedWebSocket error:', event.message);
          if (!opened) fail();
        },
      }
    );
    this.socket = socket;
  }

  private clearAttemptTimer() {
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    this.attemptTimer = null;
  }

  public retry() {
    this.reconnectDelay = timing.minDelayMs;
    this.cycleFailed = false;
    this.scanAt = 0;
    this.scanDelay = timing.minScanDelayMs;
    this.resumeOnActive = false;
    this.connect();
  }

  public disconnect() {
    this.closeSocket();
    this.activePaneId = null;
    this.setStatus('disconnected');
  }

  private closeSocket() {
    this.clearAttemptTimer();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.run++;
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
    this.clearAttemptTimer();
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
    this.reconnectDelay = nextDelay(this.reconnectDelay, delayCap(this.cycleFailed));
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private revoke(reason: string) {
    this.closeSocket();
    this.pairingData = null;
    this.phoneWorkspace = null;
    this.setPush(null);
    this.activePaneId = null;
    this.setCaps([]);
    this.setFeatures([]);
    this.setStatus('revoked', reason);
  }

  private keepRoute(route: Route | null, addresses: DesktopAddress[] | null) {
    const current = this.pairingData;
    if (!current) return;
    const next: PairingData = {
      ...current,
      ...(route ? { gatewayHost: route.host, gatewayPort: route.port } : {}),
      ...(addresses ? { addresses } : {}),
    };
    this.pairingData = next;
    const { gatewayHost, gatewayPort } = next;
    void saveRoute(next.deviceId, { gatewayHost, gatewayPort, addresses: next.addresses }).catch((err) =>
      console.warn('Saving the desktop address failed:', err)
    );
  }

  private phoneName: string | null = null;

  public setPhoneName(name: string) {
    if (name === this.phoneName) return;
    this.phoneName = name;
    if (this.status === 'connected' && this.pairingData) this.call('hello', this.helloParams()).catch(() => {});
  }

  private helloParams() {
    return {
      deviceToken: this.pairingData?.deviceToken,
      client: 'ostia-companion/1.0',
      ...(this.phoneName ? { name: this.phoneName } : {}),
    };
  }

  private async sendHello(route: Route) {
    if (!this.pairingData) return;
    try {
      const result = await this.call('hello', this.helloParams());
      this.clearAttemptTimer();
      this.reconnectDelay = timing.minDelayMs;
      this.cycleFailed = false;
      this.scanAt = 0;
      this.scanDelay = timing.minScanDelayMs;
      this.keepRoute(route, parseAddresses(result.addresses));
      this.setCaps(result.caps ?? []);
      this.setFeatures(result.features ?? []);
      this.phoneWorkspace = parsePhoneWorkspace(result.phoneWorkspace);
      this.setPush(parsePushConfig(result.push));
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
      if (type === 'push.config') this.setPush(parsePushConfig(payload));
      if (type === 'addresses.changed') this.keepRoute(null, parseAddresses(payload?.addresses));
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
    if (binary.length === 0 || binary.charCodeAt(0) !== 0x01 || !this.activePaneId) return;
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
    await this.detaching;
    const previous = this.activePaneId;
    if (previous && previous !== paneId && this.status === 'connected') await this.detachPty(previous).catch(() => {});
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
      this.emit('pty.attached', { ...result, paneId });
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
    if (this.status !== 'connected') return;
    this.detaching = this.call('pty.detach', { paneId }).catch(() => {});
    await this.detaching;
  }

  public holdPty(paneId: string, cols: number, rows: number): Promise<{ ok: true; cols: number; rows: number }> {
    return this.call('pty.hold', { paneId, cols, rows });
  }

  public releasePty(paneId: string): Promise<{ ok: true }> {
    return this.call('pty.release', { paneId });
  }

  public sendKeystroke(text: string) {
    this.sendInput(btoa(encodeUtf8(text)));
  }

  public sendInput(base64: string) {
    if (!this.socket || this.status !== 'connected') return;
    this.socket.sendBinary(btoa(String.fromCharCode(0x02) + atob(base64)));
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

  public addFeaturesListener(listener: FeaturesListener) {
    this.featuresListeners.add(listener);
    return () => {
      this.featuresListeners.delete(listener);
    };
  }

  public addCapsListener(listener: CapsListener) {
    this.capsListeners.add(listener);
    return () => {
      this.capsListeners.delete(listener);
    };
  }
}

function utf16Length(utf8Binary: string): number {
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
