import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AlertPrefs, DEFAULT_ALERT_PREFS, parseAlertPrefs } from '../model/alertPrefs';

const KEY = 'ostia_alert_prefs';
let prefs = DEFAULT_ALERT_PREFS;
const listeners = new Set<() => void>();

function publish(next: AlertPrefs) {
  prefs = next;
  listeners.forEach((listener) => listener());
}

export async function loadAlertPrefs(): Promise<void> {
  publish(parseAlertPrefs(await SecureStore.getItemAsync(KEY)));
}

export function setAlertPrefs(patch: Partial<AlertPrefs>): void {
  publish(parseAlertPrefs(JSON.stringify({ ...prefs, ...patch })));
  void SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
}

export function getAlertPrefs(): AlertPrefs {
  return prefs;
}

export function onAlertPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useAlertPrefs(): AlertPrefs {
  return useSyncExternalStore(onAlertPrefs, () => prefs);
}
