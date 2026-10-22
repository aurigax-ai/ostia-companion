import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopAddress } from '../model/rediscovery';
import { pair } from '../testing/contractClient';
import { startMockGateway, type MockGateway } from '../testing/mockGateway';
import { attempts, reset, trusted } from '../testing/nativeFake';
import type { ConnectionStatus } from './rpc';

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
vi.mock('expo-network', () => ({ getNetworkStateAsync: async () => ({ type: network.type }), NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR' } }));
vi.mock('./lanDiscovery', async () => ({
  onLocalNetwork: async () => network.type !== 'CELLULAR',
  discoverPairedRoutes: async () => {
    discovery.calls++;
    return discovery.routes;
  },
}));

const { OstiaRpc } = await import('./rpc');
const { getPairingData, savePairingData } = await import('./storage');
const { timing } = await import('../model/reconnectPolicy');
const defaults = { ...timing };

const gateways: MockGateway[] = [];
const seen: ConnectionStatus[] = [];
let off = () => {};

async function desktop(options: Parameters<typeof startMockGateway>[0] = {}) {
  const gw = await startMockGateway(options);
  gateways.push(gw);
  trusted.push(gw.certificate);
  return gw;
}

async function pairedWith(gw: MockGateway, patch: Partial<Parameters<typeof savePairingData>[0]> = {}) {
  const { result } = await pair(gw);
  const data = {
    deviceToken: result.deviceToken,
    deviceId: result.deviceId,
    pinnedFingerprint: gw.fingerprint,
    desktopName: 'brave-apple',
    gatewayHost: '127.0.0.1',
    gatewayPort: gw.port,
    privateKey: 'priv',
    publicKey: 'pub',
    ...patch,
  };
  await savePairingData(data);
  return data;
}

const lan = (port: number): DesktopAddress => ({ kind: 'lan', host: '127.0.0.1', port });
const connected = () => vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('connected'), { timeout: 4000 });
const urls = () => attempts.map((a) => a.url);
const at = (port: number) => `wss://127.0.0.1:${port}/ws`;
const DEAD_PORT = 9;

beforeEach(() => {
  store.clear();
  reset();
  network.type = 'WIFI';
  appState.currentState = 'active';
  seen.length = 0;
  discovery.routes = [];
  discovery.calls = 0;
  Object.assign(timing, defaults);
  off = OstiaRpc.addStatusListener((status) => seen.push(status));
});

afterEach(async () => {
  off();
  OstiaRpc.disconnect();
  await Promise.all(gateways.splice(0).map((gw) => gw.close()));
});

const relay = (port: number): DesktopAddress => ({ kind: 'relay', host: '127.0.0.1', port });

describe('relay addresses (contract v1.14 §4)', () => {
  it('RLY-A1 keeps a relay entry from hello and saves it', async () => {
    const gw = await desktop();
    const list = [lan(gw.port), relay(443)];
    gw.setAddresses(list);
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(OstiaRpc.getPairing()?.addresses).toEqual(list);
    expect((await getPairingData())?.addresses).toEqual(list);
  });

  it('RLY-A2 ignores a kind it does not know and keeps the relay entry beside it', async () => {
    const gw = await desktop();
    gw.setAddresses([{ kind: 'mesh', host: '127.0.0.1', port: 1 }, relay(443)] as unknown as DesktopAddress[]);
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(OstiaRpc.getPairing()?.addresses).toEqual([relay(443)]);
  });
});

describe('reconnect order with a relay entry (contract v1.14 §2)', () => {
  it('RLY-R1 tries the relay entry after the LAN entry', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(
      await pairedWith(gw, { gatewayPort: DEAD_PORT, addresses: [lan(DEAD_PORT + 1), relay(gw.port)] }),
    );
    await connected();
    expect(urls()).toEqual([at(DEAD_PORT), at(DEAD_PORT + 1), at(gw.port)]);
  });

  it('DSK-C14 goes direct first even when the last good route was the relay', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT, addresses: [relay(DEAD_PORT), lan(gw.port)] }));
    await connected();
    expect(urls()).toEqual([at(gw.port)]);
  });

  it('RLY-R5 treats a paired relay hostname as a relay route before hello lists addresses', async () => {
    const data = { deviceToken: 't', deviceId: 'd', pinnedFingerprint: 'f', desktopName: 'x', privateKey: 'p', publicKey: 'q', gatewayPort: 443 };
    const { savedRoutes } = await import('../model/rediscovery');
    const host = 'abcdefghijklmnopqrstuvwxyz.relay.ostia.apogex.dev';
    expect(savedRoutes({ ...data, gatewayHost: host })).toEqual([{ host, port: 443, kind: 'relay' }]);
    expect(savedRoutes({ ...data, gatewayHost: '192.168.1.5', addresses: [{ kind: 'relay', host, port: 443 }] }).map((r) => r.host)).toEqual(['192.168.1.5', host]);
  });

  it('RLY-R2 never reaches the relay while a direct address answers', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw, { addresses: [lan(gw.port), relay(DEAD_PORT)] }));
    await connected();
    expect(urls()).toEqual([at(gw.port)]);
  });

  it('RLY-R3 skips a relay whose certificate is not the pin and sends it no frame', async () => {
    const real = await desktop({ name: 'Real desktop' });
    const other = await desktop({ name: 'Other desktop' });
    OstiaRpc.initialize(
      await pairedWith(real, { gatewayPort: DEAD_PORT, addresses: [relay(other.port), relay(real.port)] }),
    );
    await connected();
    const impostor = attempts.find((a) => a.url === at(other.port))!;
    expect(impostor.opened).toBe(false);
    expect(impostor.sent).toEqual([]);
    expect(other.devices).toHaveLength(0);
    expect(OstiaRpc.getPairing()?.pinnedFingerprint).toBe(real.fingerprint);
  });

  it('RLY-R4 is unreachable, with the pin and token kept, when only a relay with another certificate answers', async () => {
    const real = await desktop({ name: 'Real desktop' });
    const other = await desktop({ name: 'Other desktop' });
    const data = await pairedWith(real, { gatewayPort: DEAD_PORT, addresses: [relay(other.port)] });
    OstiaRpc.initialize(data);
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('disconnected'));
    expect(attempts.every((a) => a.sent.length === 0)).toBe(true);
    expect(OstiaRpc.getPairing()?.deviceToken).toBe(data.deviceToken);
    expect(seen).not.toContain('revoked');
  });
});

describe('push configuration in hello (contract v1.14 §3)', () => {
  it('RLY-P1 parses push.server from hello', async () => {
    const gw = await desktop();
    gw.setPushServer('https://api.example.com');
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(OstiaRpc.getPush()?.server ?? null).toBe('https://api.example.com');
  });

  it('RLY-P5 reads registered from hello and from push.config', async () => {
    const gw = await desktop();
    gw.setPushServer('https://api.example.com');
    gw.setPushRegistered(true);
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(OstiaRpc.getPush()).toEqual({ server: 'https://api.example.com', registered: true });
    gw.setPushRegistered(false);
    await vi.waitFor(() => expect(OstiaRpc.getPush()?.registered).toBe(false));
  });

  it('RLY-P2 clears the server when hello has no push', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(OstiaRpc.getPush()?.server ?? null).toBeNull();
  });

  it('RLY-P3 follows push.config while connected, including null', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    gw.setPushServer('https://api.example.com');
    await vi.waitFor(() => expect(OstiaRpc.getPush()?.server ?? null).toBe('https://api.example.com'));
    gw.setPushServer(null);
    await vi.waitFor(() => expect(OstiaRpc.getPush()?.server ?? null).toBeNull());
  });

  it('RLY-P4 refuses a server that is not https', async () => {
    const gw = await desktop();
    gw.setPushServer('http://api.example.com');
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(OstiaRpc.getPush()?.server ?? null).toBeNull();
  });
});
