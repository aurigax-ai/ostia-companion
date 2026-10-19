import { useSyncExternalStore } from 'react';

export interface SnackbarMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const SHOWN_MS = 4000;

let current: SnackbarMessage | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(next: SnackbarMessage | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

export function showSnackbar(text: string, action?: SnackbarMessage['action']): void {
  if (timer) clearTimeout(timer);
  publish({ id: nextId++, text, action });
  timer = setTimeout(() => publish(null), SHOWN_MS);
}

export function hideSnackbar(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  publish(null);
}

export function useSnackbar(): SnackbarMessage | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
