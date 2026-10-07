import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_PREFS, parsePrefs, TerminalPrefs } from '../model/prefs';

const KEY = 'ostia_terminal_prefs';
let prefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();

function publish(next: TerminalPrefs) {
  prefs = next;
  listeners.forEach((listener) => listener());
}

export async function loadPrefs(): Promise<void> {
  publish(parsePrefs(await SecureStore.getItemAsync(KEY)));
}

export function setPrefs(patch: Partial<TerminalPrefs>): void {
  publish(parsePrefs(JSON.stringify({ ...prefs, ...patch })));
  void SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
}

export function getPrefs(): TerminalPrefs {
  return prefs;
}

export function usePrefs(): TerminalPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prefs,
  );
}
