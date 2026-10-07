import { Pane, Session } from './workspaces';

export interface Snapshot {
  sessions: Session[];
  panes: Pane[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  loadedAt: number | null;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  sessions: [],
  panes: [],
  loading: true,
  refreshing: false,
  error: null,
  loadedAt: null,
};

export type LoadResult = { sessions: Session[]; panes: Pane[] } | { error: string };

export function applyLoad(snapshot: Snapshot, result: LoadResult, now: number): Snapshot {
  if ('error' in result) return { ...snapshot, error: result.error };
  return { ...snapshot, sessions: result.sessions, panes: result.panes, error: null, loadedAt: now };
}
