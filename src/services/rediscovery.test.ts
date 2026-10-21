import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopAddress } from '../model/rediscovery';
import { pair } from '../testing/contractClient';
import { startMockGateway, type MockGateway } from '../testing/mockGateway';
import { attempts, behavior, lateEvent, listenerCount, reset, trusted } from '../testing/nativeFake';
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
const discovery = vi.hoisted(() => ({
  routes: [] as { host: string; port: number }[] | Promise<{ host: string; port: number }[]>,
  calls: 0,
}));
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
    return await discovery.routes;
  },
}));

const { OstiaRpc } = await import('./rpc');
const { forgetDesktop, getPairingData, loadDesktops, saveRoute, savePairingData } = await import('./storage');
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

describe('the phone name in hello (contract v1.13)', () => {
  it('PID-P8 sends the name in hello, and again when it changes while connected', async () => {
    const gw = await desktop();
    OstiaRpc.setPhoneName('Pixel 9');
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    await vi.waitFor(() => expect(gw.devices[0].name).toBe('Pixel 9'));
    OstiaRpc.setPhoneName('Desk phone');
    await vi.waitFor(() => expect(gw.devices[0].name).toBe('Desk phone'));
  });

  it('PID-P9 keeps the old name when the new one has a control character', async () => {
    const gw = await desktop();
    OstiaRpc.setPhoneName('Pixel 9');
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    await vi.waitFor(() => expect(gw.devices[0].name).toBe('Pixel 9'));
    OstiaRpc.setPhoneName('bad\u202Ename');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(gw.devices[0].name).toBe('Pixel 9');
  });
});

describe('saving the address list (contract v1.10 §1, §2)', () => {
  it('RDS-P1 keeps the list from hello with the address that worked, and saves it', async () => {
    const gw = await desktop();
    const list = [{ kind: 'tailnet' as const, host: '127.0.0.1', port: gw.port }, lan(gw.port)];
    gw.setAddresses(list);
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(OstiaRpc.getPairing()?.addresses).toEqual(list);
    expect((await getPairingData())?.addresses).toEqual(list);
  });

  it('RDS-P2 replaces the list as a whole on addresses.changed', async () => {
    const gw = await desktop({ addresses: [lan(1)] });
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    const next = [{ kind: 'tailnet' as const, host: 'box.tail1234.ts.net', port: 8722 }];
    gw.setAddresses(next);
    await vi.waitFor(() => expect(OstiaRpc.getPairing()?.addresses).toEqual(next));
    await vi.waitFor(async () => expect((await getPairingData())?.addresses).toEqual(next));
    gw.setAddresses([]);
    await vi.waitFor(() => expect(OstiaRpc.getPairing()?.addresses).toEqual([]));
  });

  it('RDS-P3 keeps what it saved when the desktop sends no list (before v1.10)', async () => {
    const gw = await desktop();
    const saved = [lan(gw.port)];
    OstiaRpc.initialize(await pairedWith(gw, { addresses: saved }));
    await connected();
    expect(OstiaRpc.getPairing()?.addresses).toEqual(saved);
  });
});

describe('an answer with no usable address', () => {
  it('RDS-P4 keeps the saved list when hello and addresses.changed carry only kinds the phone does not know', async () => {
    const future = [{ kind: 'mesh', host: 'box.example.org', port: 8722 }];
    const gw = await desktop({ addresses: future as unknown as DesktopAddress[] });
    const saved = [lan(gw.port)];
    OstiaRpc.initialize(await pairedWith(gw, { addresses: saved }));
    await connected();
    expect(OstiaRpc.getPairing()?.addresses).toEqual(saved);
    gw.setAddresses(future as unknown as DesktopAddress[]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(OstiaRpc.getPairing()?.addresses).toEqual(saved);
    expect((await getPairingData())?.addresses).toEqual(saved);
  });
});

describe('reconnect order (contract v1.10 §4)', () => {
  it('RDS-R1 tries the last good address, then the saved list in order, and never browses the LAN while one answers', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(
      await pairedWith(gw, {
        gatewayPort: DEAD_PORT,
        addresses: [{ kind: 'tailnet', host: '127.0.0.1', port: DEAD_PORT + 1 }, lan(gw.port)],
      }),
    );
    await connected();
    expect(urls()).toEqual([at(DEAD_PORT), at(DEAD_PORT + 1), at(gw.port)]);
    expect(discovery.calls).toBe(0);
  });

  it('RDS-R2 browses the LAN only after the whole saved list failed, and skips what it already tried', async () => {
    const gw = await desktop();
    discovery.routes = [{ host: '127.0.0.1', port: DEAD_PORT }, { host: '127.0.0.1', port: gw.port }];
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT, addresses: [lan(DEAD_PORT + 1)] }));
    await connected();
    expect(urls()).toEqual([at(DEAD_PORT), at(DEAD_PORT + 1), at(gw.port)]);
    expect(discovery.calls).toBe(1);
    expect(OstiaRpc.getPairing()?.gatewayPort).toBe(gw.port);
  });

  it('RDS-R3 finds a desktop that moved without pairing again, then tries that address first next time', async () => {
    const gw = await desktop({ addresses: [lan(1)] });
    const data = await pairedWith(gw);
    OstiaRpc.initialize(data);
    await connected();
    const moving = gw.move();
    discovery.routes = moving.then((port) => [{ host: '127.0.0.1', port }]);
    const moved = await moving;
    await vi.waitFor(() => expect(attempts.at(-1)?.url).toBe(at(moved)), { timeout: 4000 });
    await connected();
    expect(seen).not.toContain('revoked');
    expect(gw.devices).toHaveLength(1);
    expect(gw.checkCodes).toHaveLength(1);
    expect(OstiaRpc.getPairing()?.deviceId).toBe(data.deviceId);
    expect((await getPairingData())?.gatewayPort).toBe(moved);
    OstiaRpc.connect();
    await connected();
    expect(attempts.at(-1)?.url).toBe(at(moved));
  });

  it('RDS-R4 shows the desktop as unreachable and keeps the pin and token when nothing answers', async () => {
    const gw = await desktop();
    const data = await pairedWith(gw, { gatewayPort: DEAD_PORT });
    OstiaRpc.initialize(data);
    await vi.waitFor(() => expect(discovery.calls).toBe(1));
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('disconnected'));
    expect(seen).not.toContain('revoked');
    expect(OstiaRpc.getPairing()?.deviceToken).toBe(data.deviceToken);
    expect(OstiaRpc.getPairing()?.pinnedFingerprint).toBe(data.pinnedFingerprint);
  });
});

describe('the pin decides (contract v1.10 §4, P3)', () => {
  it('RDS-F1 refuses an address whose certificate is not the pin, sends it no frame and moves on', async () => {
    const real = await desktop({ name: 'Real desktop' });
    const other = await desktop({ name: 'Other desktop' });
    OstiaRpc.initialize(await pairedWith(real, { gatewayPort: other.port, addresses: [lan(real.port)] }));
    await connected();
    const impostor = attempts.find((a) => a.url === at(other.port))!;
    expect(impostor.opened).toBe(false);
    expect(impostor.sent).toEqual([]);
    expect(OstiaRpc.getPairing()?.pinnedFingerprint).toBe(real.fingerprint);
    expect(OstiaRpc.getPairing()?.gatewayPort).toBe(real.port);
  });

  it('RDS-F2 never re-pins: when only a different certificate answers, the desktop is unreachable and the pin stays', async () => {
    const real = await desktop({ name: 'Real desktop' });
    const other = await desktop({ name: 'Other desktop' });
    discovery.routes = [{ host: '127.0.0.1', port: other.port }];
    const data = await pairedWith(real, { gatewayPort: DEAD_PORT });
    OstiaRpc.initialize(data);
    await vi.waitFor(() => expect(attempts.some((a) => a.url === at(other.port))).toBe(true));
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('disconnected'));
    expect(attempts.every((a) => !a.opened)).toBe(true);
    expect(attempts.every((a) => a.sent.length === 0)).toBe(true);
    expect((await getPairingData())?.pinnedFingerprint).toBe(real.fingerprint);
    expect(other.devices).toHaveLength(0);
  });
});

describe('pairing again (contract v1.10 §4)', () => {
  it('RDS-X1 still means pairing again when the token is unknown (4001)', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw, { deviceToken: 'not-a-token' }));
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('revoked'));
    expect(OstiaRpc.getPairing()).toBeNull();
  });

  it('RDS-X2 still means pairing again when the device was revoked (4003)', async () => {
    const gw = await desktop();
    const data = await pairedWith(gw);
    OstiaRpc.initialize(data);
    await connected();
    gw.revoke(data.deviceId);
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('revoked'));
  });
});

describe('a stale native event (review 1)', () => {
  it('RDS-S1 ignores an earlier socket\'s open, so the live candidate is not taken as opened and gets no hello', async () => {
    const gw = await desktop();
    behavior.silent.add(`127.0.0.1:${DEAD_PORT}`);
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT }));
    await vi.waitFor(() => expect(attempts).toHaveLength(1));
    OstiaRpc.retry();
    await vi.waitFor(() => expect(attempts).toHaveLength(2));
    lateEvent('onOpen', attempts[0].id);
    lateEvent('onClose', attempts[0].id, { code: 1006, reason: 'late' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(attempts[1].sent).toEqual([]);
    expect(OstiaRpc.getStatus()).toBe('connecting');
    expect(attempts).toHaveLength(2);
  });
});

describe('a candidate that never answers (review 2)', () => {
  it('RDS-D1 moves on when a handshake failure reports only onError', async () => {
    const gw = await desktop();
    behavior.errorOnly.add(`127.0.0.1:${DEAD_PORT}`);
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT, addresses: [lan(gw.port)] }));
    await connected();
    expect(urls()).toEqual([at(DEAD_PORT), at(gw.port)]);
  });

  it('RDS-D2 gives up on a silent candidate after the deadline and tries the next', async () => {
    timing.candidateMs = 100;
    const gw = await desktop();
    behavior.silent.add(`127.0.0.1:${DEAD_PORT}`);
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT, addresses: [lan(gw.port)] }));
    await connected();
    expect(urls()).toEqual([at(DEAD_PORT), at(gw.port)]);
  });
});

describe('a candidate that opens but never answers hello', () => {
  it('RDS-D3 gives up on it after the deadline and tries the next address', async () => {
    timing.candidateMs = 100;
    const gw = await desktop();
    behavior.deaf.add(`127.0.0.1:${DEAD_PORT}`);
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT, addresses: [lan(gw.port)] }));
    await connected();
    expect(urls()).toEqual([at(DEAD_PORT), at(gw.port)]);
  });

  it('RDS-D5 gives hello its own budget after a slow connect, so a slow valid route is not cut', async () => {
    timing.candidateMs = 300;
    const gw = await desktop();
    behavior.slow.set(`127.0.0.1:${gw.port}`, 200);
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(urls()).toEqual([at(gw.port)]);
  });

  it('RDS-D4 stops waiting once hello is answered, so a live connection is not cut at the deadline', async () => {
    timing.candidateMs = 100;
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(OstiaRpc.getStatus()).toBe('connected');
    expect(attempts).toHaveLength(1);
  });
});

describe('saving while the list changes (review 3)', () => {
  const route = { gatewayHost: '10.0.0.9', gatewayPort: 1, addresses: [] };
  const later = (ms: number, run: () => Promise<unknown>) => new Promise((resolve) => setTimeout(resolve, ms)).then(run);

  it('RDS-L1 does not bring back a desktop forgotten while its route is being saved', async () => {
    const a = await desktop({ name: 'A desktop' });
    const b = await desktop({ name: 'B desktop' });
    for (let offset = 0; offset <= 8; offset++) {
      store.clear();
      const first = await pairedWith(a);
      await pairedWith(b, { deviceId: 'dev_other' });
      await Promise.all([forgetDesktop(first.deviceId), later(offset, () => saveRoute(first.deviceId, route))]);
      expect((await loadDesktops()).desktops.map((d) => d.deviceId), `offset ${offset}`).toEqual(['dev_other']);
    }
  });

  it('RDS-L2 does not drop a desktop paired while its route is being saved', async () => {
    const a = await desktop({ name: 'A desktop' });
    const b = await desktop({ name: 'B desktop' });
    const { result } = await pair(b);
    for (let offset = 0; offset <= 8; offset++) {
      store.clear();
      const first = await pairedWith(a);
      const second = { ...first, deviceId: 'dev_other', deviceToken: result.deviceToken, pinnedFingerprint: b.fingerprint };
      await Promise.all([savePairingData(second), later(offset, () => saveRoute(first.deviceId, route))]);
      expect((await loadDesktops()).desktops.map((d) => d.deviceId).sort(), `offset ${offset}`).toEqual([first.deviceId, 'dev_other'].sort());
    }
  });
});

describe('retrying without wasting the battery (review 4)', () => {
  it('RDS-B1 scans the LAN again only after its own, longer backoff', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT }));
    await vi.waitFor(() => expect(discovery.calls).toBe(1));
    await vi.waitFor(() => expect(attempts.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(discovery.calls).toBe(1);
  });

  it('RDS-B2 does not scan when the phone has no local network', async () => {
    network.type = 'CELLULAR';
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT }));
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('disconnected'));
    expect(discovery.calls).toBe(0);
  });

  it('RDS-B3 stops retrying while the app is in the background, and tries again when it returns', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw, { gatewayPort: DEAD_PORT }));
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('disconnected'));
    appState.emit('background');
    OstiaRpc.retry();
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('disconnected'));
    const tried = attempts.length;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(attempts).toHaveLength(tried);
    appState.emit('active');
    await vi.waitFor(() => expect(attempts.length).toBeGreaterThan(tried));
  });
});

describe('closing a socket that was open (review 6)', () => {
  it('RDS-C1 releases the listeners of a socket that closed after it opened', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    expect(listenerCount()).toBeGreaterThan(0);
    await gw.move();
    await vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('disconnected'));
    expect(listenerCount()).toBe(0);
  });
});
