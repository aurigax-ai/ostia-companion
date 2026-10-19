import type { Ask } from './asks';
import type { Pane, Session } from './workspaces';

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Seen = Record<string, number>;

export type NowRow = { kind: 'ask'; ask: Ask; workspace: string; at: number } | { kind: 'pane'; pane: Pane; workspace: string; at: number | null };

export interface Now {
  needsYou: NowRow[];
  working: NowRow[];
  doneToday: NowRow[];
  idle: NowRow[];
  hibernated: number;
  count: number;
}

export function isAgent(pane: Pane): boolean {
  return pane.kind === 'terminal' && !!pane.agent;
}

export function changedAt(pane: Pane, seen: Seen): number | null {
  return pane.since ?? seen[pane.paneId] ?? null;
}

function newestFirst(a: { at: number | null }, b: { at: number | null }): number {
  return (b.at ?? -Infinity) - (a.at ?? -Infinity);
}

export function phoneAgent(sessions: Session[], panes: Pane[], seen: Seen): Pane | null {
  const phone = sessions.find((session) => session.phone);
  if (!phone) return null;
  const agents = panes.filter((pane) => pane.sessionId === phone.sessionId && isAgent(pane) && !pane.hibernated);
  return [...agents].sort((a, b) => (changedAt(b, seen) ?? -Infinity) - (changedAt(a, seen) ?? -Infinity))[0] ?? null;
}

export function nowSections(asks: Ask[], sessions: Session[], panes: Pane[], seen: Seen, now: number, pinned: string | null = null): Now {
  const names = new Map(sessions.map((session) => [session.sessionId, session.name]));
  const asked = new Set(asks.map((ask) => ask.paneId));
  const row = (pane: Pane) => ({ kind: 'pane' as const, pane, workspace: names.get(pane.sessionId) ?? '', at: changedAt(pane, seen) });
  const agents = panes.filter((pane) => isAgent(pane) && pane.paneId !== pinned);
  const awake = agents.filter((pane) => !pane.hibernated);
  const needs = awake.filter((pane) => (pane.agentState === 'waiting' || pane.agentState === 'error') && !asked.has(pane.paneId));
  const working = awake.filter((pane) => pane.agentState === 'working');
  const done = awake.filter((pane) => {
    const at = changedAt(pane, seen);
    return pane.agentState === 'done' && at !== null && now - at < DAY_MS;
  });
  const shown = new Set([...needs, ...working, ...done]);
  const askRows = asks.map((ask) => ({ kind: 'ask' as const, ask, workspace: names.get(ask.sessionId) ?? '', at: ask.since }));
  return {
    needsYou: [...askRows, ...needs.map(row)].sort(newestFirst),
    working: working.map(row).sort(newestFirst),
    doneToday: done.map(row).sort(newestFirst),
    idle: awake.filter((pane) => !shown.has(pane) && !asked.has(pane.paneId)).map(row).sort(newestFirst),
    hibernated: agents.length - awake.length,
    count: asks.length + needs.length,
  };
}

export function ago(at: number | null, now: number): string {
  if (at === null) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function quietLine(idle: number, hibernated: number): string {
  return `${idle} idle · ${hibernated} hibernated`;
}
