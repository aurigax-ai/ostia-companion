import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionNotice } from './connectionNotice';
import { pairFailure } from './pairFailure';
import { TAILSCALE_PLAY_URL, openTailscale } from './tailscale';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value);
  },
  getItemAsync: async (key: string) => store.get(key) ?? null,
  deleteItemAsync: async (key: string) => {
    store.delete(key);
  },
}));

const { getPairingData, savePairingData } = await import('./storage');

beforeEach(() => store.clear());

function pairing(host: string) {
  return {
    deviceToken: 'tok',
    deviceId: 'dev_1',
    pinnedFingerprint: 'sha256/x',
    desktopName: 'Desk',
    gatewayHost: host,
    gatewayPort: 8722,
    privateKey: 'priv',
    publicKey: 'pub',
  };
}

describe('tailnet on the phone', () => {
  it('TSN-C32 tells the human to open Tailscale when a tailnet address is unreachable', () => {
    const failure = pairFailure('Network request failed', '100.114.10.128', 8722);
    expect(failure.text).toMatch(/Open the Tailscale app on this phone/);
    expect(failure.text).toMatch(/same tailnet/);
    expect(failure.action).toBe('open-tailscale');
    expect(pairFailure('Network request failed', '192.168.2.108', 8722).action).toBeUndefined();
  });

  it('TSN-C33 opens the Tailscale store page when the app is not installed', async () => {
    const openURL = vi.fn(async () => {});
    const openApplication = vi.fn(async () => {
      throw new Error('package not found');
    });
    await openTailscale({ platform: 'android', openApplication, openURL });
    expect(openApplication).toHaveBeenCalledWith('com.tailscale.ipn');
    expect(openURL).toHaveBeenCalledWith(TAILSCALE_PLAY_URL);
  });

  it('TSN-C34 offers Pair again when the stored host cannot be reached, and re-pairing replaces it', async () => {
    const notice = connectionNotice('disconnected', '192.168.2.108');
    expect(notice?.text).toMatch(/192\.168\.2\.108/);
    expect(notice?.actions).toContain('pair-again');
    expect(connectionNotice('connected', '100.114.10.128')).toBeNull();

    await savePairingData(pairing('192.168.2.108'));
    await savePairingData(pairing('100.114.10.128'));
    expect((await getPairingData())?.gatewayHost).toBe('100.114.10.128');
  });
});
