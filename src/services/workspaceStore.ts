import { useEffect, useSyncExternalStore } from 'react';
import { Pane, Session, applyPaneUpdate, applySessionState } from '../model/workspaces';
import { OstiaRpc } from './rpc';

interface Snapshot {
  sessions: Session[];
  panes: Pane[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

const EMPTY: Snapshot = { sessions: [], panes: [], loading: true, refreshing: false, error: null };
const AGENT_REFETCH_MS = 300;

let snapshot = EMPTY;
let started = false;
let agentRefetch: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export async function refreshWorkspaces(pulled = false) {
  update(pulled ? { refreshing: true } : { loading: snapshot.sessions.length === 0 });
  try {
    const [sessionResult, paneResult] = await Promise.all([
      OstiaRpc.call('session.list'),
      OstiaRpc.call('pane.list'),
    ]);
    update({ sessions: sessionResult.sessions ?? [], panes: paneResult.panes ?? [], error: null });
  } catch (err: any) {
    update({ error: err?.message || 'Could not load workspaces' });
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
  snapshot = EMPTY;
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
