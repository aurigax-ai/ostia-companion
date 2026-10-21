import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  store: new Map<string, string>(),
  options: [] as unknown[],
  marker: false,
  names: [] as string[],
  counter: 0,
}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'this-device-only',
  getItemAsync: async (key: string, options: unknown) => (env.options.push(options), env.store.get(key) ?? null),
  setItemAsync: async (key: string, value: string, options: unknown) => (env.options.push(options), void env.store.set(key, value)),
}));
vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => Uint8Array.from({ length: n }, () => ++env.counter % 256) }));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    get exists() {
      return env.marker;
    }
    create() {
      env.marker = true;
    }
  },
}));
vi.mock('react', () => ({ useSyncExternalStore: () => null }));
vi.mock('./rpc', () => ({ OstiaRpc: { setPhoneName: (name: string) => env.names.push(name) } }));

beforeEach(() => {
  vi.resetModules();
  env.store.clear();
  env.options.length = 0;
  env.names.length = 0;
  env.marker = false;
  env.counter = 0;
});

describe('phone identity service', () => {
  it('PID-P11 creates the identity once, with a generated name, and keeps it on the next launch', async () => {
    const { loadPhoneIdentity } = await import('./phoneIdentity');
    const first = await loadPhoneIdentity();
    expect(first.name).toMatch(/^[a-z]+-[a-z]+$/);
    expect(env.names).toEqual([first.name]);

    vi.resetModules();
    const again = await (await import('./phoneIdentity')).loadPhoneIdentity();
    expect(again).toEqual(first);
  });

  it('PID-P13 keeps the identity on this device only, out of backups and other phones', async () => {
    const { loadPhoneIdentity } = await import('./phoneIdentity');
    await loadPhoneIdentity();
    expect(env.options.every((o) => (o as { keychainAccessible?: string }).keychainAccessible === 'this-device-only')).toBe(true);
    expect(env.options.length).toBeGreaterThan(0);
  });

  it('PID-P14 starts a new identity after a reinstall, when the keychain still holds the old one', async () => {
    const { loadPhoneIdentity } = await import('./phoneIdentity');
    const before = await loadPhoneIdentity();
    env.marker = false;
    vi.resetModules();
    const after = await (await import('./phoneIdentity')).loadPhoneIdentity();
    expect(after.installId).not.toBe(before.installId);
  });

  it('PID-P15 renames the phone, keeps the name across launches and tells the desktop link', async () => {
    const { loadPhoneIdentity, renamePhone } = await import('./phoneIdentity');
    const first = await loadPhoneIdentity();
    expect(await renamePhone('  Desk phone ')).toBe(true);
    expect(env.names.at(-1)).toBe('Desk phone');
    expect(await renamePhone('bad‮name')).toBe(false);
    expect(await renamePhone('   ')).toBe(false);
    expect(env.names.at(-1)).toBe('Desk phone');

    vi.resetModules();
    const again = await (await import('./phoneIdentity')).loadPhoneIdentity();
    expect(again).toEqual({ installId: first.installId, name: 'Desk phone' });
  });
});
