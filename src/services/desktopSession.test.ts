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
    disconnect: () => calls.push('disconnect'),
    initialize: (data: { deviceId: string }) => calls.push(`connect ${data.deviceId}`),
  },
}));
vi.mock('./workspaceStore', () => ({ resetWorkspaces: () => calls.push('clear workspaces') }));

const { savePairingData } = await import('./storage');
const { switchDesktop } = await import('./desktopSession');

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
    expect(calls).toEqual(['disconnect', 'clear workspaces', 'connect dev_a']);
  });
});
