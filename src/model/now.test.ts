import { describe, expect, it } from 'vitest';
import type { Ask } from './asks';
import { ago, DAY_MS, nowSections } from './now';
import type { Pane, Session } from './workspaces';

const NOW = 10 * DAY_MS;
const sessions: Session[] = [
  { sessionId: 's-a', name: 'ledger-api', kind: 'agent', workDir: '/w/a', state: 'waiting' },
  { sessionId: 's-b', name: 'atlas-web', kind: 'agent', workDir: '/w/b', state: 'working' },
];

function agent(paneId: string, patch: Partial<Pane>): Pane {
  return { paneId, sessionId: 's-a', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', ...patch };
}

const ask: Ask = {
  askId: 'ask-1', sessionId: 's-b', paneId: 'p-asked', kind: 'question', title: 'Which one?', choices: [], allowText: true, since: NOW - 60_000,
};

const ids = (rows: { kind: string; pane?: Pane; ask?: Ask }[]) => rows.map((row) => (row.kind === 'ask' ? row.ask!.askId : row.pane!.paneId));

describe('Now', () => {
  it('PHA-C2 puts what needs you, what works and what finished today first, newest first, and folds the rest', () => {
    const panes = [
      agent('p-wait-old', { agentState: 'waiting', since: NOW - 9 * 60_000 }),
      agent('p-error', { agentState: 'error', since: NOW - 2 * 60_000 }),
      agent('p-asked', { sessionId: 's-b', agentState: 'waiting', since: NOW - 30_000 }),
      agent('p-work-1', { agentState: 'working', since: NOW - 4 * 60_000 }),
      agent('p-work-2', { sessionId: 's-b', agentState: 'working', since: NOW - 60_000 }),
      agent('p-done', { agentState: 'done', since: NOW - 3 * 60 * 60_000 }),
      agent('p-done-old', { agentState: 'done', since: NOW - 2 * DAY_MS }),
      agent('p-idle', { since: NOW - DAY_MS }),
      agent('p-sleep', { hibernated: true, agentState: 'done' }),
      { paneId: 'p-shell', sessionId: 's-a', kind: 'terminal', title: 'zsh', running: true, blockCount: 3 },
    ];
    const now = nowSections([ask], sessions, panes, {}, NOW);
    expect(ids(now.needsYou)).toEqual(['ask-1', 'p-error', 'p-wait-old']);
    expect(ids(now.working)).toEqual(['p-work-2', 'p-work-1']);
    expect(ids(now.doneToday)).toEqual(['p-done']);
    expect(ids(now.idle)).toEqual(['p-idle', 'p-done-old']);
    expect(now.hibernated).toBe(1);
    expect(now.count).toBe(3);
    expect(now.working[0].workspace).toBe('atlas-web');
  });

  it('PHA-C3 leaves a finished pane under the quiet line when nobody knows when it finished', () => {
    const panes = [agent('p-done', { agentState: 'done' }), agent('p-seen', { agentState: 'done' })];
    const now = nowSections([], sessions, panes, { 'p-seen': NOW - 60 * 60_000 }, NOW);
    expect(ids(now.doneToday)).toEqual(['p-seen']);
    expect(ids(now.idle)).toEqual(['p-done']);
  });

  it('says how long ago in calm short units', () => {
    expect([null, NOW - 10_000, NOW - 6 * 60_000, NOW - 3 * 60 * 60_000, NOW - 2 * DAY_MS].map((at) => ago(at, NOW))).toEqual(['', 'now', '6 m', '3 h', '2 d']);
  });
});
