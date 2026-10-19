import { useSyncExternalStore } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import {
  accessibilityEnabled,
  addStatusListener,
  askConsent,
  installedApps,
  isSupported,
  PhoneSessionStatus,
  openAccessibilitySettings,
  resumeSession,
  sessionStatus,
  startSession,
  stopSession,
  takePendingAsk,
} from 'phone-control';
import type { SessionLimit, StartFailure } from '../model/phoneSession';
import type { Session } from '../model/workspaces';
import { getBlockedApps } from './blockedAppsStore';
import { OstiaRpc } from './rpc';
import { onWorkspaces } from './workspaceStore';

export { accessibilityEnabled, installedApps as phoneApps, isSupported as phoneControlSupported, openAccessibilitySettings };

let status: PhoneSessionStatus = sessionStatus();
const listeners = new Set<() => void>();
let removeNative: (() => void) | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!removeNative) {
    status = sessionStatus();
    removeNative = addStatusListener((next) => {
      status = next;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      removeNative?.();
      removeNative = null;
    }
  };
}

export function usePhoneSession(): PhoneSessionStatus {
  return useSyncExternalStore(subscribe, () => status);
}

export async function startPhoneSession(sessionId: string, label: string, limit: SessionLimit): Promise<StartFailure | null> {
  const pairing = OstiaRpc.getPairing();
  if (!pairing) return 'not-paired';
  if ((await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) return 'lock-needed';
  const verified = await LocalAuthentication.authenticateAsync({
    promptMessage: `Let ${pairing.desktopName || 'your desktop'} see this screen`,
    cancelLabel: 'Cancel',
  });
  if (!verified.success) return 'not-verified';
  const notifications = await Notifications.getPermissionsAsync();
  if (!notifications.granted && !(await Notifications.requestPermissionsAsync()).granted) return 'notifications-needed';
  if (!(await askConsent())) return 'cancelled';
  const started = startSession({
    host: pairing.gatewayHost,
    port: pairing.gatewayPort,
    fingerprint: pairing.pinnedFingerprint,
    deviceToken: pairing.deviceToken,
    sessionId,
    label,
    desktopName: pairing.desktopName || 'Your desktop',
    limitSec: limit * 60,
    level: 'control',
    agentName: 'The agent',
    blocked: getBlockedApps(),
  });
  return started ? null : 'not-started';
}

export function stopPhoneSession(): void {
  stopSession();
}

export function resumePhoneSession(): void {
  resumeSession();
}

type PhoneNavigate = {
  toAsk: (sessionId: string, name: string, askId: string) => void;
  toSession: (sessionId: string, name: string) => void;
};

let linksStarted = false;

export function startPhoneSessionLinks(navigate: PhoneNavigate): void {
  if (linksStarted || Platform.OS !== 'android' || !isSupported()) return;
  linksStarted = true;
  let sessions: Session[] = [];
  onWorkspaces((snapshot) => (sessions = snapshot.sessions));
  const openPendingAsk = () => {
    const ask = takePendingAsk();
    if (ask) navigate.toAsk(ask.sessionId, ask.label, ask.askId);
  };
  AppState.addEventListener('change', (state) => state === 'active' && openPendingAsk());
  OstiaRpc.addEventListener((type, payload) => {
    if (type !== 'screen.requested' || typeof payload?.sessionId !== 'string') return;
    const name = sessions.find((session) => session.sessionId === payload.sessionId)?.name ?? 'a workspace';
    const desktop = OstiaRpc.getPairing()?.desktopName || 'Your desktop';
    void Notifications.scheduleNotificationAsync({
      identifier: `screen-request:${payload.sessionId}`,
      content: {
        title: `${desktop} asks to use this phone`,
        body: `For ${name}. Open to start a session, or ignore it.`,
        data: { kind: 'screen-request', sessionId: payload.sessionId, name },
      },
      trigger: { channelId: 'agents' },
    });
  });
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { kind?: string; sessionId?: string; name?: string };
    if (data?.kind === 'screen-request' && data.sessionId) navigate.toSession(data.sessionId, data.name ?? 'Workspace');
  });
}
