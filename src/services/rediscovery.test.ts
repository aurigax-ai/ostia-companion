import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopAddress } from '../model/rediscovery';
import { pair } from '../testing/contractClient';
import { startMockGateway, type MockGateway } from '../testing/mockGateway';
import { attempts } from '../testing/pinnedSocketFake';
import type { ConnectionStatus } from './rpc';

const store = vi.hoisted(() => new Map<string, string>());
const discovery = vi.hoisted(() => ({ routes: [] as { host: string; port: number }[], calls: 0 }));
vi.mock('expo-secure-store', () => ({
  setItemAsync: async (key: string, value: string) => void store.set(key, value),
  getItemAsync: async (key: string) => store.get(key) ?? null,
  deleteItemAsync: async (key: string) => void store.delete(key),
}));
vi.mock('websocket-pinning', async () => import('../testing/pinnedSocketFake'));
vi.mock('./lanDiscovery', () => ({
  discoverPairedRoutes: async () => {
    discovery.calls++;
    return discovery.routes;
  },
}));

const { OstiaRpc } = await import('./rpc');
const { getPairingData, savePairingData } = await import('./storage');

const gateways: MockGateway[] = [];
const seen: ConnectionStatus[] = [];
let off = () => {};

async function desktop(options: Parameters<typeof startMockGateway>[0] = {}) {
  const gw = await startMockGateway(options);
  gateways.push(gw);
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
  attempts.length = 0;
  seen.length = 0;
  discovery.routes = [];
  discovery.calls = 0;
  off = OstiaRpc.addStatusListener((status) => seen.push(status));
});

afterEach(async () => {
  off();
  OstiaRpc.disconnect();
  await Promise.all(gateways.splice(0).map((gw) => gw.close()));
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
    const moved = await gw.move();
    discovery.routes = [{ host: '127.0.0.1', port: moved }];
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
