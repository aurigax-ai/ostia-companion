import { useEffect, useSyncExternalStore } from 'react';
import { EMPTY_SNAPSHOT, Snapshot, applyLoad } from '../model/snapshot';
import { applyPaneUpdate, applySessionState } from '../model/workspaces';
import { OstiaRpc } from './rpc';

const AGENT_REFETCH_MS = 300;

let snapshot = EMPTY_SNAPSHOT;
let started = false;
let agentRefetch: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<Snapshot>) {
  set({ ...snapshot, ...patch });
}

function set(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export async function refreshWorkspaces(pulled = false) {
  update(pulled ? { refreshing: true } : { loading: snapshot.sessions.length === 0 });
  try {
    const [sessionResult, paneResult] = await Promise.all([
      OstiaRpc.call('session.list'),
      OstiaRpc.call('pane.list'),
    ]);
    set(applyLoad(snapshot, { sessions: sessionResult.sessions ?? [], panes: paneResult.panes ?? [] }, Date.now()));
  } catch (err: any) {
    set(applyLoad(snapshot, { error: err?.message || 'Could not load workspaces' }, Date.now()));
  } finally {
    update({ loading: false, refreshing: false });
  }
}

function refetchAgents() {
  if (agentRefetch) clearTimeout(agentRefetch);
  agentRefetch = setTimeout(() => {
    agentRefetch = null;
    void refreshWorkspaces();
  }, AGENT_REFETCH_MS);
}

function start() {
  if (started) return;
  started = true;
  OstiaRpc.addStatusListener((status) => {
    if (status === 'connected') void refreshWorkspaces();
  });
  OstiaRpc.addEventListener((type, payload) => {
    if (type === 'pane.state') update({ panes: applyPaneUpdate(snapshot.panes, payload) });
    else if (type === 'session.state') {
      update({ sessions: applySessionState(snapshot.sessions, payload.sessionId, payload.state) });
      refetchAgents();
    }
  });
  if (OstiaRpc.getStatus() === 'connected') void refreshWorkspaces();
  else update({ loading: false });
}

export function resetWorkspaces() {
  snapshot = EMPTY_SNAPSHOT;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWorkspaces(): Snapshot {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => snapshot);
}

export function useConnectionStatus() {
  return useSyncExternalStore(
    (listener) => OstiaRpc.addStatusListener(listener),
    () => OstiaRpc.getStatus(),
  );
}

export function useCaps() {
  return useSyncExternalStore(
    (listener) => OstiaRpc.addCapsListener(listener),
    () => OstiaRpc.getCaps(),
  );
}
