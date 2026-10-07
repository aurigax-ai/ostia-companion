import { paneStatus, Pane, Session, Status, workspaceStatus } from './workspaces';

const BAND: Record<Status['kind'], number> = { waiting: 0, error: 0, running: 1, done: 2, idle: 2 };

export function rankStatus(status: Status): number {
  return BAND[status.kind];
}

export function attentionRank(pane: Pane): number {
  return rankStatus(paneStatus(pane));
}

export function byAttention<T>(items: T[], rank: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, band: rank(item) }))
    .sort((a, b) => a.band - b.band || a.index - b.index)
    .map(({ item }) => item);
}

export function workspaceRank(panes: Pane[]): (session: Session) => number {
  return (session) => rankStatus(workspaceStatus(session, panes.filter((pane) => pane.sessionId === session.sessionId)));
}

export function homeSections(sessions: Session[]): { title: string; sessions: Session[] }[] {
  if (sessions.length === 0) return [];
  const groups = new Map<string, { title: string; sessions: Session[] }>();
  const other: Session[] = [];
  for (const session of sessions) {
    if (!session.group) {
      other.push(session);
      continue;
    }
    const group = groups.get(session.group.id) ?? { title: session.group.name, sessions: [] };
    group.sessions.push(session);
    groups.set(session.group.id, group);
  }
  const named = [...groups.values()];
  if (named.length + (other.length > 0 && named.length > 0 ? 1 : 0) <= 1) return [{ title: 'Workspaces', sessions }];
  return other.length > 0 ? [...named, { title: 'Other', sessions: other }] : named;
}
