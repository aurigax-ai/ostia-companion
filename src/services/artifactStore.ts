import { useSyncExternalStore } from 'react';
import { ArtifactChange, Unread, applyArtifactChange, markArtifactRead } from '../model/artifacts';
import { OstiaRpc } from './rpc';

interface ArtifactSnapshot {
  unread: Unread;
  last: ArtifactChange | null;
  revision: number;
}

const EMPTY: ArtifactSnapshot = { unread: {}, last: null, revision: 0 };
let snapshot = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function set(next: ArtifactSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function start() {
  if (started) return;
  started = true;
  OstiaRpc.addStatusListener((status) => {
    if (status === 'revoked') set(EMPTY);
    else if (status === 'connected') set({ ...snapshot, last: null, revision: snapshot.revision + 1 });
  });
  OstiaRpc.addEventListener((type, payload) => {
    if (type !== 'artifact.changed' || typeof payload?.sessionId !== 'string' || typeof payload?.path !== 'string') return;
    set({ unread: applyArtifactChange(snapshot.unread, payload), last: payload, revision: snapshot.revision + 1 });
  });
}

export function resetArtifacts() {
  set(EMPTY);
}

export function markRead(sessionId: string, path: string) {
  const unread = markArtifactRead(snapshot.unread, sessionId, path);
  if (unread !== snapshot.unread) set({ ...snapshot, unread });
}

export function useArtifacts(): ArtifactSnapshot {
  start();
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}
