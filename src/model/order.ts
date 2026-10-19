import { paneStatus, Pane, Status } from './workspaces';

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
