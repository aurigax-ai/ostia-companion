import { alertForAsk, alertForPane, type AgentAlert } from './agentAlerts';
import type { AlertPrefs } from './alertPrefs';
import type { Ask } from './asks';
import type { Pane, Session } from './workspaces';

export const RAISED_MEMORY_MS = 24 * 60 * 60 * 1000;
export const RAISED_MAX_IDS = 200;

export function wakeAlerts(
  asks: Ask[],
  panes: Pane[],
  sessions: Session[],
  prefs: AlertPrefs,
  presentedIds: string[],
  raisedIds: string[],
): AgentAlert[] {
  if (!prefs.waiting) return [];
  const showing = new Set(presentedIds);
  const raised = new Set(raisedIds);
  const askAlerts = asks
    .map((ask) => alertForAsk(ask, sessions))
    .filter((alert) => !showing.has(alert.id) && !raised.has(alert.id));
  const promptAlerts = panes
    .filter((pane) => pane.agentState === 'waiting' && !asks.some((ask) => ask.paneId === pane.paneId))
    .flatMap((pane) => alertForPane(pane, sessions, prefs) ?? [])
    .filter((alert) => !showing.has(alert.id) && !(alert.key && raised.has(alert.key)));
  return [...askAlerts, ...promptAlerts];
}

const ASK_PREFIX = 'ask:';

function newest(entries: [string, number][]): [string, number][] {
  return entries.sort((a, b) => b[1] - a[1]).slice(0, RAISED_MAX_IDS);
}

export function pruneRaised(raised: Record<string, number>, now: number): Record<string, number> {
  const recent = Object.entries(raised).filter(([, at]) => typeof at === 'number' && now - at < RAISED_MEMORY_MS);
  const asks = recent.filter(([key]) => key.startsWith(ASK_PREFIX));
  const prompts = recent.filter(([key]) => !key.startsWith(ASK_PREFIX));
  return Object.fromEntries([...newest(asks), ...newest(prompts)]);
}
