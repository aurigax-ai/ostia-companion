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
import type { Level } from '../model/phoneControlPrefs';
import { endedLine, isActive, SessionLimit, StartFailure } from '../model/phoneSession';
import { showSnackbar } from './snackbar';
import { getBlockedApps } from './blockedAppsStore';
import { OstiaRpc } from './rpc';

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

export function currentPhoneSession(): PhoneSessionStatus {
  return removeNative ? status : sessionStatus();
}

export function usePhoneSession(): PhoneSessionStatus {
  return useSyncExternalStore(subscribe, () => status);
}

export async function confirmWithFingerprint(promptMessage: string): Promise<StartFailure | null> {
  if ((await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) return 'lock-needed';
  const verified = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
  return verified.success ? null : 'not-verified';
}

export async function startPhoneSession(
  sessionId: string,
  label: string,
  { level, limit, fingerprint, agent, requestId }: { level: Level; limit: SessionLimit; fingerprint: boolean; agent?: string | null; requestId?: string | null },
): Promise<StartFailure | null> {
  const pairing = OstiaRpc.getPairing();
  if (!pairing) return 'not-paired';
  if ((await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE) return 'lock-needed';
  const verified = fingerprint ? await confirmWithFingerprint(`Let ${pairing.desktopName || 'your desktop'} see this screen`) : null;
  if (verified) return verified;
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
    level,
    agentName: agent ?? 'The agent',
    ...(requestId ? { requestId } : {}),
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

let linksStarted = false;

export function startPhoneSessionLinks(toAsk: (sessionId: string, name: string, askId: string) => void): void {
  if (linksStarted || Platform.OS !== 'android' || !isSupported()) return;
  linksStarted = true;
  const openPendingAsk = () => {
    const ask = takePendingAsk();
    if (ask) toAsk(ask.sessionId, ask.label, ask.askId);
  };
  AppState.addEventListener('change', (state) => state === 'active' && openPendingAsk());
}

let endNoticeStarted = false;

export function startSessionEndNotice(onDetails: () => void): void {
  if (endNoticeStarted || !isSupported()) return;
  endNoticeStarted = true;
  let wasActive = isActive(sessionStatus().state);
  addStatusListener((next) => {
    if (wasActive && next.state === 'stopped') showSnackbar(endedLine(next.reason), { label: 'Details', run: onDetails });
    wasActive = isActive(next.state);
  });
}
