import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (status: string) => void;

const rpc = vi.hoisted(() => {
  const state = {
    pairing: null as object | null,
    status: 'disconnected',
    listeners: new Set<(status: string) => void>(),
    calls: [] as string[],
    onBegin: (() => {}) as () => void,
  };
  return state;
});
const defined = vi.hoisted(() => ({ tasks: new Map<string, () => Promise<void>>(), registered: [] as string[] }));
const app = vi.hoisted(() => ({ state: 'background' }));
const posted = vi.hoisted(() => [] as string[]);
const stored = vi.hoisted(() => ({ pairing: null as object | null }));

vi.mock('react-native', () => ({ AppState: { get currentState() { return app.state; } } }));
vi.mock('expo-task-manager', () => ({
  defineTask: (name: string, task: () => Promise<void>) => void defined.tasks.set(name, task),
}));
vi.mock('expo-notifications', () => ({
  registerTaskAsync: async (name: string) => void defined.registered.push(name),
  getPresentedNotificationsAsync: async () => [],
}));
vi.mock('./agentWatch', () => ({ post: async (alert: { id: string }) => void posted.push(alert.id) }));
vi.mock('./raisedAlerts', () => ({ raisedIds: async () => [] }));
vi.mock('./alertPrefsStore', () => ({
  loadAlertPrefs: async () => {},
  getAlertPrefs: () => ({ waiting: true, done: true, failed: true }),
}));
vi.mock('./storage', () => ({ getPairingData: async () => stored.pairing }));
vi.mock('./rpc', () => ({
  OstiaRpc: {
    getPairing: () => rpc.pairing,
    getStatus: () => rpc.status,
    addStatusListener: (listener: Listener) => {
      rpc.listeners.add(listener);
      return () => void rpc.listeners.delete(listener);
    },
    initialize: (pairing: object) => {
      rpc.calls.push('initialize');
      rpc.pairing = pairing;
      rpc.status = 'connecting';
      rpc.onBegin();
    },
    retry: () => {
      rpc.calls.push('retry');
      rpc.status = 'connecting';
      rpc.onBegin();
    },
    disconnect: () => {
      rpc.calls.push('disconnect');
      rpc.status = 'disconnected';
    },
    call: async (method: string) => {
      rpc.calls.push(method);
      if (method === 'ask.list') return { asks: [ask] };
      if (method === 'pane.list') return { panes: [] };
      return { sessions: [] };
    },
  },
}));

const ask = {
  askId: 'a1',
  sessionId: 's1',
  paneId: 'p1',
  kind: 'permission',
  agent: 'claude',
  title: 'Apply?',
  choices: [{ id: 'y', label: 'Yes', tone: 'approve' }],
  allowText: false,
  since: 1,
};

const emit = (status: string) => {
  rpc.status = status;
  [...rpc.listeners].forEach((listener) => listener(status));
};

const { defineWakeTask, registerWakeTask } = await import('./pushWakeTask');
defineWakeTask();
const runTask = () => defined.tasks.get('ostia-push-wake')!();

beforeEach(() => {
  rpc.pairing = null;
  rpc.status = 'disconnected';
  rpc.listeners.clear();
  rpc.calls.length = 0;
  rpc.onBegin = () => {};
  posted.length = 0;
  stored.pairing = null;
  app.state = 'background';
});

describe('the wake task (contract v1.14 §5)', () => {
  it('PSH-T1 defines the task and registers it with expo-notifications', async () => {
    expect(defined.tasks.has('ostia-push-wake')).toBe(true);
    await registerWakeTask();
    expect(defined.registered).toEqual(['ostia-push-wake']);
  });

  it('PSH-T2 raises an alert at once on an instance that is already connected, and keeps the connection', async () => {
    rpc.pairing = {};
    rpc.status = 'connected';
    await runTask();
    expect(posted).toEqual(['ask:a1']);
    expect(rpc.calls).not.toContain('retry');
    expect(rpc.calls).not.toContain('disconnect');
  });

  it('PSH-T3 starts the connection itself when nothing is loaded, and lets go of it when the app is in the background', async () => {
    stored.pairing = { deviceId: 'dev_1' };
    rpc.onBegin = () => queueMicrotask(() => emit('connected'));
    await runTask();
    expect(rpc.calls[0]).toBe('initialize');
    expect(posted).toEqual(['ask:a1']);
    expect(rpc.calls.at(-1)).toBe('disconnect');
  });

  it('PSH-T4 keeps the connection when the app came to the front meanwhile', async () => {
    stored.pairing = { deviceId: 'dev_1' };
    app.state = 'active';
    rpc.onBegin = () => queueMicrotask(() => emit('connected'));
    await runTask();
    expect(rpc.calls).not.toContain('disconnect');
  });

  it('PSH-T5 does nothing when no desktop is paired', async () => {
    await runTask();
    expect(rpc.calls).toEqual([]);
    expect(posted).toEqual([]);
  });

  it('PSH-T6 gives up and disconnects when the headless connection ends in a failed cycle', async () => {
    stored.pairing = { deviceId: 'dev_1' };
    rpc.onBegin = () => queueMicrotask(() => emit('disconnected'));
    await runTask();
    expect(posted).toEqual([]);
    expect(rpc.calls).toEqual(['initialize', 'disconnect']);
  });

  it('PSH-T7 retries a parked instance and raises the alert once it connects', async () => {
    rpc.pairing = {};
    rpc.status = 'disconnected';
    rpc.onBegin = () => queueMicrotask(() => emit('connected'));
    await runTask();
    expect(rpc.calls[0]).toBe('retry');
    expect(posted).toEqual(['ask:a1']);
  });

  it('PSH-T8 stops waiting at the disconnected that ends the retry cycle, not after 20 s', async () => {
    rpc.pairing = {};
    rpc.status = 'disconnected';
    rpc.onBegin = () => queueMicrotask(() => emit('disconnected'));
    const started = Date.now();
    await runTask();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(posted).toEqual([]);
    expect(rpc.calls).toEqual(['retry']);
  });

  it('PSH-T9 waits for a connection that is already being made without starting another', async () => {
    rpc.pairing = {};
    rpc.status = 'connecting';
    const done = runTask();
    setTimeout(() => emit('connected'), 20);
    await done;
    expect(rpc.calls).not.toContain('retry');
    expect(posted).toEqual(['ask:a1']);
  });
});
