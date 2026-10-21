import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { post } from './agentWatch';
import { raisedIds } from './raisedAlerts';
import { getAlertPrefs, loadAlertPrefs } from './alertPrefsStore';
import { runWake } from './pushWake';
import { OstiaRpc } from './rpc';
import { getPairingData } from './storage';

const TASK = 'ostia-push-wake';
const CONNECT_TIMEOUT_MS = 20000;

function connectCycle(begin: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(false), CONNECT_TIMEOUT_MS);
    const off = OstiaRpc.addStatusListener((status) => {
      if (status === 'connected') finish(true);
      else if (status === 'disconnected' || status === 'revoked') finish(false);
    });
    function finish(connected: boolean) {
      clearTimeout(timer);
      off();
      resolve(connected);
    }
    begin();
  });
}

async function connect() {
  if (OstiaRpc.getPairing() !== null) {
    const status = OstiaRpc.getStatus();
    const connected = status === 'connected' || (await connectCycle(() => status !== 'connecting' && OstiaRpc.retry()));
    return connected ? { release: () => {} } : null;
  }
  const pairing = await getPairingData();
  if (!pairing) return null;
  const connected = await connectCycle(() => OstiaRpc.initialize(pairing));
  if (!connected) {
    OstiaRpc.disconnect();
    return null;
  }
  return { release: () => (AppState.currentState !== 'active' ? OstiaRpc.disconnect() : undefined) };
}

export function defineWakeTask(): void {
  TaskManager.defineTask(TASK, async () => {
    await loadAlertPrefs();
    await runWake({
      connect,
      call: (method) => OstiaRpc.call(method),
      presentedIds: async () => (await Notifications.getPresentedNotificationsAsync()).map((n) => n.request.identifier),
      raisedIds,
      prefs: getAlertPrefs,
      post,
    });
  });
}

export async function registerWakeTask(): Promise<void> {
  await Notifications.registerTaskAsync(TASK);
}
