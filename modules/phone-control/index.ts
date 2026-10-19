import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type PhoneSessionState = 'idle' | 'starting' | 'running' | 'paused' | 'stopped';

export interface PhoneSessionStatus {
  state: PhoneSessionState;
  reason: string | null;
  endsAt: number;
  screenId: string | null;
  sessionId: string | null;
}

export interface PhoneSessionOptions {
  host: string;
  port: number;
  fingerprint: string;
  deviceToken: string;
  sessionId: string;
  label: string;
  desktopName: string;
  limitSec: number;
  level: 'view' | 'control';
  agentName: string;
  blocked: string[];
}

export interface PendingAsk {
  sessionId: string;
  askId: string;
  label: string;
}

export interface InstalledApp {
  package: string;
  label: string;
  alwaysBlocked: boolean;
}

interface PhoneControlNative {
  isAvailable(): boolean;
  status(): PhoneSessionStatus;
  askConsent(): Promise<boolean>;
  start(options: PhoneSessionOptions): boolean;
  stop(): void;
  resume(): void;
  accessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
  takePendingAsk(): PendingAsk | null;
  installedApps(): InstalledApp[];
  addListener(event: 'onStatus', listener: (status: PhoneSessionStatus) => void): { remove(): void };
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<PhoneControlNative>('PhoneControl') : null;

const IDLE: PhoneSessionStatus = { state: 'idle', reason: null, endsAt: 0, screenId: null, sessionId: null };

export function isSupported(): boolean {
  return native?.isAvailable() ?? false;
}

export function sessionStatus(): PhoneSessionStatus {
  return native?.status() ?? IDLE;
}

export function askConsent(): Promise<boolean> {
  return native?.askConsent() ?? Promise.resolve(false);
}

export function startSession(options: PhoneSessionOptions): boolean {
  return native?.start(options) ?? false;
}

export function stopSession(): void {
  native?.stop();
}

export function addStatusListener(listener: (status: PhoneSessionStatus) => void): () => void {
  const subscription = native?.addListener('onStatus', listener);
  return () => subscription?.remove();
}

export function resumeSession(): void {
  native?.resume();
}

export function accessibilityEnabled(): boolean {
  return native?.accessibilityEnabled() ?? false;
}

export function openAccessibilitySettings(): void {
  native?.openAccessibilitySettings();
}

export function takePendingAsk(): PendingAsk | null {
  return native?.takePendingAsk() ?? null;
}

export function installedApps(): InstalledApp[] {
  return native?.installedApps() ?? [];
}
