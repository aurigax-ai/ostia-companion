import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_LIST_PREFS, ListPrefs, parseListPrefs, rememberSearch, toggleFold } from '../model/listPrefs';

const KEY = 'ostia_list_prefs';
let prefs = DEFAULT_LIST_PREFS;
const listeners = new Set<() => void>();

function publish(next: ListPrefs) {
  prefs = next;
  listeners.forEach((listener) => listener());
  void SecureStore.setItemAsync(KEY, JSON.stringify(next));
}

export async function loadListPrefs(): Promise<void> {
  prefs = parseListPrefs(await SecureStore.getItemAsync(KEY));
  listeners.forEach((listener) => listener());
}

export function toggleSection(key: string): void {
  publish(toggleFold(prefs, key));
}

export function addRecentSearch(query: string): void {
  publish(rememberSearch(prefs, query));
}

export function rememberChatWorkspace(sessionId: string): void {
  publish({ ...prefs, lastChat: sessionId });
}

export function useListPrefs(): ListPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prefs,
  );
}
