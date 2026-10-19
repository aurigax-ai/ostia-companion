import { useSyncExternalStore } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import {
  accessibilityEnabled,
  addStatusListener,
  askConsent,
  isSupported,
  PhoneSessionStatus,
  openAccessibilitySettings,
  resumeSession,
  sessionStatus,
  startSession,
  stopSession,
} from 'phone-control';
import type { SessionLimit, StartFailure } from '../model/phoneSession';
import { OstiaRpc } from './rpc';

export { accessibilityEnabled, isSupported as phoneControlSupported, openAccessibilitySettings };

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
    blocked: [],
  });
  return started ? null : 'not-started';
}

export function stopPhoneSession(): void {
  stopSession();
}

export function resumePhoneSession(): void {
  resumeSession();
}
