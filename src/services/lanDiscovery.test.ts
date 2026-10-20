import { afterEach, describe, expect, it, vi } from 'vitest';

const zeroconf = vi.hoisted(() => ({ throwOnScan: false, stopped: 0, removed: 0, scans: 0 }));
vi.mock('react-native-zeroconf', () => ({
  default: class {
    subscribe() {}
    scan() {
      zeroconf.scans++;
      if (zeroconf.throwOnScan) throw new Error('no multicast');
    }
    stop() {
      zeroconf.stopped++;
    }
    removeDeviceListeners() {
      zeroconf.removed++;
    }
  },
}));
vi.mock('expo-network', () => ({ getNetworkStateAsync: async () => ({ type: 'WIFI' }), NetworkStateType: { WIFI: 'WIFI' } }));

const { discoverPairedRoutes } = await import('./lanDiscovery');
const { SEARCH_MS } = await import('./discovery');

afterEach(() => {
  vi.useRealTimers();
  Object.assign(zeroconf, { throwOnScan: false, stopped: 0, removed: 0, scans: 0 });
});

describe('LAN discovery for a paired phone', () => {
  it('RDS-Z1 releases the scanner when starting the scan throws', async () => {
    zeroconf.throwOnScan = true;
    await expect(discoverPairedRoutes()).resolves.toEqual([]);
    expect(zeroconf.stopped).toBe(1);
    expect(zeroconf.removed).toBe(1);
  });

  it('RDS-Z2 searches as long as pairing discovery does', async () => {
    vi.useFakeTimers();
    let done = false;
    void discoverPairedRoutes().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(SEARCH_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(zeroconf.stopped).toBe(1);
  });
});
