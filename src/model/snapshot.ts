import type { Seen } from './now';
import { Pane, Session } from './workspaces';

export interface Snapshot {
  sessions: Session[];
  panes: Pane[];
  seen: Seen;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  loadedAt: number | null;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  sessions: [],
  panes: [],
  seen: {},
  loading: true,
  refreshing: false,
  error: null,
  loadedAt: null,
};

export type LoadResult = { sessions: Session[]; panes: Pane[] } | { error: string };

function stateOf(pane: Pane): string {
  return `${pane.agentState ?? ''}|${pane.running}|${pane.hibernated ?? false}`;
}

export function noteChanges(before: Pane[], after: Pane[], seen: Seen, now: number, known: boolean): Seen {
  const earlier = new Map(before.map((pane) => [pane.paneId, pane]));
  const next: Seen = {};
  for (const pane of after) {
    const old = earlier.get(pane.paneId);
    const changed = old ? stateOf(old) !== stateOf(pane) : known;
    const at = changed ? now : seen[pane.paneId];
    if (at !== undefined) next[pane.paneId] = at;
  }
  return next;
}

export function applyLoad(snapshot: Snapshot, result: LoadResult, now: number): Snapshot {
  if ('error' in result) return { ...snapshot, error: result.error };
  const seen = noteChanges(snapshot.panes, result.panes, snapshot.seen, now, snapshot.loadedAt !== null);
  return { ...snapshot, sessions: result.sessions, panes: result.panes, seen, error: null, loadedAt: now };
}
