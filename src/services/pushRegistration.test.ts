import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../model/push';
import { pair } from '../testing/contractClient';
import { startMockGateway, type MockGateway } from '../testing/mockGateway';
import { reset, trusted } from '../testing/nativeFake';

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
const push = vi.hoisted(() => ({ token: vi.fn(), listeners: [] as ((token?: unknown) => void)[], fetch: vi.fn() }));
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

vi.mock('expo-notifications', () => ({
  getDevicePushTokenAsync: () => push.token(),
  addPushTokenListener: (listener: (token?: unknown) => void) => void push.listeners.push(listener),
}));

const { OstiaRpc } = await import('./rpc');
const { forgetPush, getPushStatus, startPushRegistration, unregisterPush, resetPushRegistration } = await import('./pushRegistration');
vi.stubGlobal('fetch', push.fetch);
startPushRegistration();
const { getPairingData, savePairingData } = await import('./storage');
const { timing } = await import('../model/reconnectPolicy');
const defaults = { ...timing };

const gateways: MockGateway[] = [];

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

const connected = () => vi.waitFor(() => expect(OstiaRpc.getStatus()).toBe('connected'), { timeout: 4000 });

beforeEach(() => {
  store.clear();
  reset();
  network.type = 'WIFI';
  appState.currentState = 'active';
  discovery.routes = [];
  discovery.calls = 0;
  push.token.mockReset();
  push.fetch.mockReset();
  resetPushRegistration();
  Object.assign(timing, defaults);
});

afterEach(async () => {
  OstiaRpc.disconnect();
  await Promise.all(gateways.splice(0).map((gw) => gw.close()));
});


const SERVER = 'https://api.example.com';
const created = (handle: string) => ({ status: 201, json: async () => ({ handle }) });
const refused = (status: number, retryAfter: string | null = null) => ({
  status,
  json: async () => ({ error: 'no' }),
  headers: { get: () => retryAfter },
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const storedPush = async () => (await getPairingData())?.push;

async function connectWithServer(
  gw: MockGateway,
  patch: Partial<Parameters<typeof savePairingData>[0]> = {},
  registered = false,
) {
  gw.setPushServer(SERVER);
  if (registered) gw.setPushRegistered(true);
  OstiaRpc.initialize(await pairedWith(gw, patch));
  await connected();
}

describe('push registration (contract v1.14 §4)', () => {
  it('PSH-R1 gets a ticket, registers the Android token with it, then sends the handle over the socket', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'fcm-token-1' });
    push.fetch.mockResolvedValue(created('h1'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'h1', platform: 'fcm' }]));
    expect(push.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = push.fetch.mock.calls[0];
    expect(url).toBe(`${SERVER}/v1/push/register`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ platform: 'fcm', token: 'fcm-token-1', ticket: 'ticket-1' });
    await vi.waitFor(async () => expect(await storedPush()).toEqual({ server: SERVER, handle: 'h1', tokenHash: hashToken('fcm-token-1') }));
  });

  it('PSH-R2 registers an iOS token as apns', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'ios', data: 'apns-token-1' });
    push.fetch.mockResolvedValue(created('h2'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'h2', platform: 'apns' }]));
  });

  it.each([429, 500])('PSH-R3 backs off on %i and sends no handle', async (status) => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(refused(status));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(push.fetch).toHaveBeenCalled());
    await settle();
    expect(push.fetch).toHaveBeenCalledTimes(1);
    expect(gw.push.registered).toEqual([]);
    expect(await storedPush()).toBeUndefined();
  });

  it('PSH-R24 stops with its own line on 503 busy and does not retry', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(refused(503));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(getPushStatus()).toEqual({ server: SERVER, state: 'busy' }));
    await settle();
    expect(push.fetch).toHaveBeenCalledTimes(1);
    expect(gw.push.registered).toEqual([]);
  });

  it('PSH-R4 asks for a new ticket once after 403 and then registers', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValueOnce(refused(403)).mockResolvedValueOnce(created('h3'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'h3', platform: 'fcm' }]));
    expect(gw.push.tickets).toEqual(['ticket-1', 'ticket-2']);
    expect(JSON.parse(push.fetch.mock.calls[1][1].body).ticket).toBe('ticket-2');
  });

  it('PSH-R5 gives up after a second 403 until the next reconnect', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(refused(403));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.tickets).toHaveLength(2));
    await settle();
    expect(gw.push.tickets).toHaveLength(2);
    expect(gw.push.registered).toEqual([]);
    expect(getPushStatus()).toEqual({ server: SERVER, state: 'refused' });
  });

  it('PSH-R6 shows unavailable and never retries when the build has no push configuration', async () => {
    const gw = await desktop();
    push.token.mockRejectedValue(new Error('no firebase'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(push.token).toHaveBeenCalled());
    await settle();
    expect(push.token).toHaveBeenCalledTimes(1);
    expect(getPushStatus()).toEqual({ server: SERVER, state: 'unavailable' });
    expect(push.fetch).not.toHaveBeenCalled();
    expect(gw.push.tickets).toEqual([]);
  });

  it('PSH-R7 does nothing while hello carries no push', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    await settle();
    expect(push.token).not.toHaveBeenCalled();
    expect(OstiaRpc.getPush()?.server ?? null).toBeNull();
  });

  it('PSH-R8 forgets the stored handle when push.config says null', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(created('h4'));
    await connectWithServer(gw);
    await vi.waitFor(async () => expect((await storedPush())?.handle).toBe('h4'));
    gw.setPushServer(null);
    await vi.waitFor(async () => expect(await storedPush()).toBeUndefined());
  });

  it('PSH-R9 forgets a stored handle when hello carries no push', async () => {
    const gw = await desktop();
    OstiaRpc.initialize(await pairedWith(gw, { push: { server: SERVER, handle: 'old', tokenHash: 'x' } }));
    await connected();
    await vi.waitFor(async () => expect(await storedPush()).toBeUndefined());
  });

  it('PSH-R10 starts registering when push.config turns the server on while connected', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(created('h5'));
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    gw.setPushServer(SERVER);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'h5', platform: 'fcm' }]));
  });

  it('PSH-R11 trusts a stored handle for the same server and token when the desktop says it is registered', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    await connectWithServer(gw, { push: { server: SERVER, handle: 'kept', tokenHash: hashToken('tok') } }, true);
    await vi.waitFor(() => expect(getPushStatus().state).toBe('on'));
    await settle();
    expect(push.fetch).not.toHaveBeenCalled();
    expect(gw.push.registered).toEqual([]);
    expect(await storedPush()).toEqual({ server: SERVER, handle: 'kept', tokenHash: hashToken('tok') });
  });

  it('PSH-R15 registers again when the desktop says it holds no live handle', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(created('fresh'));
    await connectWithServer(gw, { push: { server: SERVER, handle: 'dead', tokenHash: hashToken('tok') } }, false);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'fresh', platform: 'fcm' }]));
    expect((await storedPush())?.handle).toBe('fresh');
  });

  it('PSH-R16 registers again when the platform token changed while the app was not running', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'rotated' });
    push.fetch.mockResolvedValue(created('after-rotation'));
    await connectWithServer(gw, { push: { server: SERVER, handle: 'old', tokenHash: hashToken('tok') } }, true);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'after-rotation', platform: 'fcm' }]));
    expect((await storedPush())?.tokenHash).toBe(hashToken('rotated'));
  });

  it('PSH-R17 registers again when push.config reports registered false while connected', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValueOnce(created('one')).mockResolvedValueOnce(created('two'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toHaveLength(1));
    gw.setPushRegistered(false);
    await vi.waitFor(() => expect(gw.push.registered.map((r) => r.handle)).toEqual(['one', 'two']));
  });

  it('PSH-R18 shows not allowed and neither retries nor asks for a ticket without the notify permission', async () => {
    const gw = await desktop();
    const data = await pairedWith(gw);
    gw.setCaps(data.deviceId, ['read']);
    gw.setPushServer(SERVER);
    OstiaRpc.initialize(data);
    await connected();
    await settle();
    expect(getPushStatus()).toEqual({ server: SERVER, state: 'notAllowed' });
    expect(gw.push.tickets).toEqual([]);
    expect(push.token).not.toHaveBeenCalled();
  });

  it('PSH-R19 shows refused for a 400 and does not retry', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(refused(400));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(getPushStatus().state).toBe('refused'));
    await settle();
    expect(push.fetch).toHaveBeenCalledTimes(1);
  });

  it('PSH-R20 waits as long as Retry-After says on 429, then registers', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValueOnce(refused(429, '1')).mockResolvedValueOnce(created('later'));
    const started = Date.now();
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'later', platform: 'fcm' }]), { timeout: 4000 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it('PSH-R21 forgets the local handle and unregisters when the desktop is left', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(created('h7'));
    await connectWithServer(gw);
    await vi.waitFor(async () => expect((await storedPush())?.handle).toBe('h7'));
    await forgetPush(OstiaRpc.getPairing()!.deviceId);
    expect(gw.push.unregistered).toBe(1);
    expect(await storedPush()).toBeUndefined();
  });

  it('PSH-R12 registers again with a new handle when the platform token refreshes', async () => {
    const gw = await desktop();
    push.token.mockResolvedValueOnce({ type: 'android', data: 'tok-a' }).mockResolvedValueOnce({ type: 'android', data: 'tok-b' });
    push.fetch.mockResolvedValueOnce(created('first')).mockResolvedValueOnce(created('second'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toHaveLength(1));
    push.listeners.forEach((listener) => listener({ type: 'android', data: 'tok-b' }));
    await vi.waitFor(() => expect(gw.push.registered.map((r) => r.handle)).toEqual(['first', 'second']));
    expect(JSON.parse(push.fetch.mock.calls[1][1].body).token).toBe('tok-b');
    await vi.waitFor(async () => expect((await storedPush())?.handle).toBe('second'));
  });

  it('PSH-R13 registers again after pairing again, because the new record has no handle', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValueOnce(created('before')).mockResolvedValueOnce(created('after'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toHaveLength(1));
    OstiaRpc.disconnect();
    OstiaRpc.initialize(await pairedWith(gw));
    await connected();
    await vi.waitFor(() => expect(gw.push.registered.map((r) => r.handle)).toEqual(['before', 'after']));
  });

  it('PSH-R14 tells the desktop to forget the handle when the desktop is removed', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(created('h6'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toHaveLength(1));
    await unregisterPush(OstiaRpc.getPairing()!.deviceId);
    expect(gw.push.unregistered).toBe(1);
  });

  it('PSH-R22 does not loop when reading the token makes the platform emit it to the listener', async () => {
    const gw = await desktop();
    push.token.mockImplementation(async () => {
      const token = { type: 'android', data: 'tok' };
      queueMicrotask(() => push.listeners.forEach((listener) => listener(token)));
      return token;
    });
    push.fetch.mockResolvedValue(created('once'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toEqual([{ handle: 'once', platform: 'fcm' }]));
    await settle();
    expect(push.token.mock.calls.length).toBeLessThanOrEqual(2);
    expect(push.fetch).toHaveBeenCalledTimes(1);
    expect(gw.push.registered).toHaveLength(1);
    expect(getPushStatus().state).toBe('on');
  });

  it('PSH-R23 ignores an event that carries the stored token and registers for one that carries a new token', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValueOnce(created('one')).mockResolvedValueOnce(created('two'));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(gw.push.registered).toHaveLength(1));
    push.listeners.forEach((listener) => listener({ type: 'android', data: 'tok' }));
    await settle();
    expect(gw.push.registered).toHaveLength(1);
    push.token.mockResolvedValue({ type: 'android', data: 'new' });
    push.listeners.forEach((listener) => listener({ type: 'android', data: 'new' }));
    await vi.waitFor(() => expect(gw.push.registered.map((r) => r.handle)).toEqual(['one', 'two']));
  });

  it('PSH-R25 treats an answer from another origin as refused and keeps no handle', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue({ ...created('evil'), url: 'https://elsewhere.example.net/v1/push/register' });
    await connectWithServer(gw);
    await vi.waitFor(() => expect(getPushStatus().state).toBe('refused'));
    expect(gw.push.registered).toEqual([]);
    expect(await storedPush()).toBeUndefined();
  });

  it('PSH-R26 treats a 3xx answer as refused', async () => {
    const gw = await desktop();
    push.token.mockResolvedValue({ type: 'android', data: 'tok' });
    push.fetch.mockResolvedValue(refused(307));
    await connectWithServer(gw);
    await vi.waitFor(() => expect(getPushStatus().state).toBe('refused'));
    expect(gw.push.registered).toEqual([]);
  });
});
