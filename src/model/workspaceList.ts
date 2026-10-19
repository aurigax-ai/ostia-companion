import type { Ask } from './asks';
import { ago, changedAt, DAY_MS, isAgent, Seen } from './now';
import { failedExit, Pane, paneTitle, Session, shortPath } from './workspaces';

export const SLEEP_AFTER_MS = 3 * DAY_MS;

export interface WorkspaceRow {
  session: Session;
  needs: number;
  lastActive: number | null;
  summary: string;
  attention: boolean;
}

export interface WorkspaceSection {
  key: string;
  title: string | null;
  rows: WorkspaceRow[];
  needs: number;
  open: boolean;
  folds: boolean;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function busy(pane: Pane): boolean {
  return pane.agentState === 'working' || pane.agentState === 'waiting' || (!isAgent(pane) && pane.running);
}

export function lastActive(panes: Pane[], seen: Seen): number | null {
  const times = panes.map((pane) => changedAt(pane, seen)).filter((at): at is number => at !== null);
  return times.length > 0 ? Math.max(...times) : null;
}

export function isSleeping(panes: Pane[], seen: Seen, now: number): boolean {
  if (panes.length === 0) return false;
  if (panes.every((pane) => pane.hibernated)) return true;
  if (panes.some((pane) => !pane.hibernated && busy(pane))) return false;
  const at = lastActive(panes, seen);
  return at !== null && now - at >= SLEEP_AFTER_MS;
}

export function workspaceSummary(panes: Pane[], seen: Seen, now: number): string {
  const failed = panes.filter((pane) => pane.agentState === 'error' || failedExit(pane) !== null);
  if (failed.length > 0) return `Failed ${ago(lastActive(failed, seen), now)}`.trim();
  const terminals = panes.filter((pane) => pane.kind === 'terminal');
  const hibernated = terminals.filter((pane) => pane.hibernated).length;
  if (hibernated > 0) return `${terminals.length - hibernated} active · ${hibernated} hibernated`;
  const working = terminals.filter((pane) => pane.agentState === 'working').length;
  const shells = terminals.filter((pane) => !isAgent(pane)).length;
  const agents = terminals.length - shells;
  const head = working > 0 ? `${working} working` : agents > 0 ? plural(agents, 'agent') : null;
  if (!head && shells === 0) return 'Empty';
  if (!terminals.some(busy)) {
    const at = lastActive(terminals, seen);
    if (at !== null && now - at >= DAY_MS) return `Idle for ${plural(Math.floor((now - at) / DAY_MS), 'day')}`;
  }
  return [head, shells > 0 ? plural(shells, 'shell') : null].filter(Boolean).join(' · ');
}

export function workspaceSections(
  sessions: Session[],
  panes: Pane[],
  asks: Ask[],
  seen: Seen,
  now: number,
  unfolded: string[],
): WorkspaceSection[] {
  const rows = sessions.map((session): WorkspaceRow & { sleeping: boolean } => {
    const own = panes.filter((pane) => pane.sessionId === session.sessionId);
    const needs =
      asks.filter((ask) => ask.sessionId === session.sessionId).length +
      own.filter((pane) => !pane.hibernated && (pane.agentState === 'waiting' || pane.agentState === 'error')).length;
    return {
      session,
      needs,
      lastActive: lastActive(own, seen),
      summary: workspaceSummary(own, seen, now),
      attention: needs > 0,
      sleeping: needs === 0 && isSleeping(own, seen, now),
    };
  });
  const byActivity = (list: WorkspaceRow[]) =>
    list.map((row, index) => ({ row, index })).sort((a, b) => (b.row.lastActive ?? -Infinity) - (a.row.lastActive ?? -Infinity) || a.index - b.index).map(({ row }) => row);
  const sections: WorkspaceSection[] = [];
  const awake = rows.filter((row) => !row.sleeping);
  const loose = awake.filter((row) => !row.session.group);
  if (loose.length > 0) sections.push({ key: 'ungrouped', title: null, rows: byActivity(loose), needs: 0, open: true, folds: false });
  const groups = new Map<string, { title: string; rows: WorkspaceRow[] }>();
  for (const row of awake) {
    const group = row.session.group;
    if (!group) continue;
    const entry = groups.get(group.id) ?? { title: group.name, rows: [] };
    entry.rows.push(row);
    groups.set(group.id, entry);
  }
  for (const [id, group] of groups) {
    const needs = group.rows.reduce((sum, row) => sum + row.needs, 0);
    sections.push({ key: `group:${id}`, title: group.title, rows: byActivity(group.rows), needs, open: needs > 0 || unfolded.includes(`group:${id}`), folds: true });
  }
  const sleeping = rows.filter((row) => row.sleeping);
  if (sleeping.length > 0) sections.push({ key: 'sleeping', title: 'Sleeping', rows: sleeping, needs: 0, open: unfolded.includes('sleeping'), folds: true });
  return sections;
}

export type SearchHit = { kind: 'workspace'; session: Session; summary: string } | { kind: 'pane'; pane: Pane; workspace: string; line: string };

export function search(query: string, sessions: Session[], panes: Pane[], seen: Seen, now: number): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const names = new Map(sessions.map((session) => [session.sessionId, session.name]));
  const workspaces = sessions
    .filter((session) => session.name.toLowerCase().includes(needle))
    .map((session): SearchHit => ({
      kind: 'workspace',
      session,
      summary: workspaceSummary(panes.filter((pane) => pane.sessionId === session.sessionId), seen, now),
    }));
  const found = panes
    .filter((pane) => pane.kind === 'terminal')
    .filter((pane) => [names.get(pane.sessionId), paneTitle(pane), pane.agent, pane.agentMessage].some((text) => text?.toLowerCase().includes(needle)))
    .map((pane): SearchHit => ({ kind: 'pane', pane, workspace: names.get(pane.sessionId) ?? '', line: pane.agentMessage ?? shortPath(pane.cwd) }));
  return [...workspaces, ...found];
}

export function matchRange(text: string, query: string): [number, number] | null {
  const needle = query.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  return at < 0 ? null : [at, at + needle.length];
}

export interface PaneSections {
  active: Pane[];
  idle: Pane[];
  hibernated: Pane[];
}

export function paneSections(panes: Pane[], seen: Seen): PaneSections {
  const terminals = panes.filter((pane) => pane.kind === 'terminal');
  const newest = (list: Pane[]) => [...list].sort((a, b) => (changedAt(b, seen) ?? -Infinity) - (changedAt(a, seen) ?? -Infinity));
  const awake = terminals.filter((pane) => !pane.hibernated);
  const active = awake.filter((pane) => busy(pane) || pane.agentState === 'error' || failedExit(pane) !== null);
  return {
    active: newest(active),
    idle: newest(awake.filter((pane) => !active.includes(pane))),
    hibernated: newest(terminals.filter((pane) => pane.hibernated)),
  };
}
