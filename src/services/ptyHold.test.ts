import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pair } from '../testing/contractClient';
import { startMockGateway, type MockGateway } from '../testing/mockGateway';
import { reset, trusted } from '../testing/nativeFake';

const store = vi.hoisted(() => new Map<string, string>());
const appState = vi.hoisted(() => {
  const handlers: ((state: string) => void)[] = [];
  return {
    currentState: 'active',
    addEventListener: (_: string, handler: (state: string) => void) => void handlers.push(handler),
    emit(state: string) {
      appState.currentState = state;
      handlers.forEach((handler) => handler(state));
    },
  };
});
const network = vi.hoisted(() => ({ type: 'WIFI' }));
const discovery = vi.hoisted(() => ({ routes: [] as { host: string; port: number }[], calls: 0 }));
vi.mock('expo-secure-store', () => ({
  setItemAsync: async (key: string, value: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    store.set(key, value);
  },
  getItemAsync: async (key: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return store.get(key) ?? null;
  },
  deleteItemAsync: async (key: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    store.delete(key);
  },
}));
vi.mock('expo-modules-core', async () => {
  const fake = await import('../testing/nativeFake');
  return { requireNativeModule: () => fake.nativeModule, EventEmitter: function () { return fake.emitter; } };
});
vi.mock('react-native', () => ({ AppState: appState }));
vi.mock('expo-network', () => ({ getNetworkStateAsync: async () => ({ type: network.type }), NetworkStateType: { WIFI: 'WIFI' } }));
vi.mock('./lanDiscovery', async () => ({
  onLocalNetwork: async () => network.type !== 'CELLULAR',
  discoverPairedRoutes: async () => {
    discovery.calls++;
    return discovery.routes;
  },
}));

const { OstiaRpc } = await import('./rpc');
const { savePairingData } = await import('./storage');

const gateways: MockGateway[] = [];

async function connectedTo(caps: ('read' | 'notify' | 'input')[]) {
  const gw = await startMockGateway({ caps });
  gateways.push(gw);
  trusted.push(gw.certificate);
  const { result } = await pair(gw);
  await savePairingData({
    deviceToken: result.deviceToken,
    deviceId: result.deviceId,
    pinnedFingerprint: gw.fingerprint,
    desktopName: 'brave-apple',
    gatewayHost: '127.0.0.1',
    gatewayPort: gw.port,
    privateKey: 'priv',
    publicKey: 'pub',
  });
  OstiaRpc.initialize((await (await import('./storage')).getPairingData())!);
  await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('connected'), { timeout: 4000 });
  return gw;
}

beforeEach(() => {
  store.clear();
  reset();
  network.type = 'WIFI';
  discovery.routes = [];
});

afterEach(async () => {
  OstiaRpc.disconnect();
  vi.restoreAllMocks();
  await Promise.all(gateways.splice(0).map((gw) => gw.close()));
});

describe('pty attach and hold over the real client and gateway', () => {
  it('CRD-R1 switching panes waits for the old pane to detach before it attaches the new one', async () => {
    await connectedTo(['read', 'input']);
    await OstiaRpc.attachPty('p-api-zsh', 'owner');
    const calls: string[] = [];
    const call = OstiaRpc.call.bind(OstiaRpc);
    vi.spyOn(OstiaRpc, 'call').mockImplementation(async (method: string, params?: object) => {
      calls.push(`${method} start`);
      const result = await call(method, params);
      calls.push(`${method} end`);
      return result;
    });
    const detaching = OstiaRpc.detachPty('p-api-zsh');
    await OstiaRpc.attachPty('p-dev', 'owner');
    await detaching;
    expect(calls).toEqual(['pty.detach start', 'pty.detach end', 'pty.attach start', 'pty.attach end']);
  });

  it('CRD-R2 the attached event names the pane it is for', async () => {
    await connectedTo(['read']);
    const events: { type: string; payload: { paneId?: string; cols?: number } }[] = [];
    OstiaRpc.addEventListener((type, payload) => events.push({ type, payload }));
    await OstiaRpc.attachPty('p-api-zsh', 'observer');
    expect(events.find((e) => e.type === 'pty.attached')?.payload).toMatchObject({ paneId: 'p-api-zsh', cols: 64 });
  });

  it('CRD-R3 hold needs an attached pane and the input cap, and release gives the size back', async () => {
    const gw = await connectedTo(['read', 'input']);
    await expect(OstiaRpc.holdPty('p-api-zsh', 50, 20)).rejects.toMatchObject({ message: 'not-attached' });
    await OstiaRpc.attachPty('p-api-zsh', 'owner');
    const sizes: number[] = [];
    OstiaRpc.addEventListener((type, payload) => type === 'pty.size' && sizes.push(payload.cols));
    await expect(OstiaRpc.holdPty('p-api-zsh', 50, 20)).resolves.toEqual({ ok: true, cols: 50, rows: 20 });
    await OstiaRpc.releasePty('p-api-zsh');
    await vi.waitFor(() => expect(sizes).toEqual([50, 64]));
    expect(gw.devices.length).toBe(1);
  });

  it('CRD-R4 output that arrives after a detach is not delivered', async () => {
    await connectedTo(['read', 'input']);
    const received: string[] = [];
    OstiaRpc.addPtyListener((base64) => received.push(atob(base64)));
    await OstiaRpc.attachPty('p-api-zsh', 'owner');
    const before = received.length;
    await OstiaRpc.detachPty('p-api-zsh');
    (OstiaRpc as unknown as { handleBinaryFrame: (base64: string) => void }).handleBinaryFrame(btoa('\x01late'));
    expect(received).toHaveLength(before);
  });
});
