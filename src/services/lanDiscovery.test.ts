import { afterEach, describe, expect, it, vi } from 'vitest';

const network = vi.hoisted(() => ({ type: 'WIFI' }));
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
vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => ({ type: network.type }),
  NetworkStateType: { NONE: 'NONE', UNKNOWN: 'UNKNOWN', CELLULAR: 'CELLULAR', WIFI: 'WIFI', ETHERNET: 'ETHERNET', OTHER: 'OTHER' },
}));

const { discoverPairedRoutes, onLocalNetwork } = await import('./lanDiscovery');
const { SEARCH_MS } = await import('./discovery');

afterEach(() => {
  network.type = 'WIFI';
  vi.useRealTimers();
  Object.assign(zeroconf, { throwOnScan: false, stopped: 0, removed: 0, scans: 0 });
});

describe('LAN discovery for a paired phone', () => {
  it.each(['WIFI', 'ETHERNET', 'OTHER'])('RDS-Z3 looks for the desktop on a %s network', async (type) => {
    network.type = type;
    await expect(onLocalNetwork()).resolves.toBe(true);
  });

  it.each(['CELLULAR', 'NONE', 'UNKNOWN'])('RDS-Z4 does not look for the desktop on a %s network', async (type) => {
    network.type = type;
    await expect(onLocalNetwork()).resolves.toBe(false);
  });

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
