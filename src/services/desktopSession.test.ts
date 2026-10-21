import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
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
vi.mock('./rpc', () => ({
  OstiaRpc: {
    getPairing: () => ({ deviceId: 'dev_b' }),
    disconnect: () => calls.push('disconnect'),
    initialize: (data: { deviceId: string }) => calls.push(`connect ${data.deviceId}`),
  },
}));
vi.mock('./pushRegistration', () => ({
  unregisterPush: async (id: string) => void calls.push(`unregister push ${id}`),
  forgetPush: async (id: string) => void calls.push(`forget push ${id}`),
}));
vi.mock('./workspaceStore', () => ({ resetWorkspaces: () => calls.push('clear workspaces') }));

const { savePairingData } = await import('./storage');
const { releasePushOfPrevious, removeDesktopAndReconnect, switchDesktop } = await import('./desktopSession');

beforeEach(() => {
  store.clear();
  calls.length = 0;
});

function desktop(deviceId: string) {
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

describe('switching desktops', () => {
  it('DSK-C9 closes the old connection, clears the workspaces and connects the chosen desktop', async () => {
    await savePairingData(desktop('dev_a'));
    await savePairingData(desktop('dev_b'));
    await switchDesktop('dev_a');
    expect(calls).toEqual(['forget push dev_b', 'disconnect', 'clear workspaces', 'connect dev_a']);
  });

  it('DSK-C13 unregisters the handle of a desktop that is removed, then connects the next one', async () => {
    await savePairingData(desktop('dev_a'));
    await savePairingData(desktop('dev_b'));
    expect(await removeDesktopAndReconnect('dev_b')).toBe(true);
    expect(calls).toEqual(['unregister push dev_b', 'disconnect', 'clear workspaces', 'connect dev_a']);
  });

  it('DSK-C15 releases the push handle of the previous active desktop when another one is paired', async () => {
    await releasePushOfPrevious('dev_new');
    expect(calls).toEqual(['forget push dev_b']);
  });

  it('DSK-C16 releases nothing when the paired desktop is the active one', async () => {
    await releasePushOfPrevious('dev_b');
    expect(calls).toEqual([]);
  });
});
