import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PairingData } from './storage';

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

const { loadDesktops, savePairingData, chooseSavedDesktop } = await import('./storage');

beforeEach(() => store.clear());

function desktop(deviceId: string): PairingData {
  return {
    deviceToken: `tok-${deviceId}`,
    deviceId,
    pinnedFingerprint: `sha256/${deviceId}`,
    desktopName: deviceId,
    gatewayHost: '192.168.1.20',
    gatewayPort: 8722,
    privateKey: 'priv',
    publicKey: 'pub',
  };
}

describe('saved desktops', () => {
  it('DSK-C7 reads every saved desktop back with the same one active', async () => {
    await savePairingData(desktop('dev_a'));
    await savePairingData(desktop('dev_b'));
    await chooseSavedDesktop('dev_a');
    const list = await loadDesktops();
    expect(list.desktops.map((d) => d.deviceId)).toEqual(['dev_a', 'dev_b']);
    expect(list.activeId).toBe('dev_a');
  });

  it('DSK-C8 skips a desktop whose entry is missing or unreadable', async () => {
    await savePairingData(desktop('dev_a'));
    await savePairingData(desktop('dev_b'));
    await savePairingData(desktop('dev_c'));
    store.delete('ostia_desktop_dev_a');
    store.set('ostia_desktop_dev_b', '{not json');
    const list = await loadDesktops();
    expect(list.desktops.map((d) => d.deviceId)).toEqual(['dev_c']);
    expect(list.activeId).toBe('dev_c');
  });

  it('DSK-C10 ignores the single-desktop keys from before', async () => {
    store.set('ostia_device_token', 'tok');
    store.set('ostia_device_id', 'dev_old');
    store.set('ostia_gateway_host', '100.64.1.2');
    expect(await loadDesktops()).toEqual({ desktops: [], activeId: null });
  });
});
