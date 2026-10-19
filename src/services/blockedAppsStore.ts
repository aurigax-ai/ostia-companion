import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { parseBlocked, toggleBlocked } from '../model/blockedApps';

const KEY = 'ostia_phone_blocked_apps';
let blocked: string[] = [];
const listeners = new Set<() => void>();

function publish(next: string[]) {
  blocked = next;
  listeners.forEach((listener) => listener());
}

export async function loadBlockedApps(): Promise<void> {
  publish(parseBlocked(await SecureStore.getItemAsync(KEY)));
}

export function setBlocked(packageName: string, on: boolean): void {
  publish(toggleBlocked(blocked, packageName, on));
  void SecureStore.setItemAsync(KEY, JSON.stringify(blocked));
}

export function getBlockedApps(): string[] {
  return blocked;
}

export function useBlockedApps(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => blocked,
  );
}
