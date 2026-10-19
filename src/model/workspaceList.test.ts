import { describe, expect, it } from 'vitest';
import type { Ask } from './asks';
import { DAY_MS } from './now';
import { matchRange, paneSections, search, workspaceSections, workspaceSummary } from './workspaceList';
import type { Pane, Session } from './workspaces';

const NOW = 20 * DAY_MS;
const goji = { id: 'g-goji', name: 'goji' };
const personal = { id: 'g-personal', name: 'personal' };

function session(sessionId: string, name: string, group?: { id: string; name: string }): Session {
  return { sessionId, name, kind: 'agent', workDir: `/w/${name}`, state: 'idle', ...(group ? { group } : {}) };
}

function pane(paneId: string, sessionId: string, patch: Partial<Pane> = {}): Pane {
  return { paneId, sessionId, kind: 'terminal', title: 'claude', running: false, blockCount: 1, agent: 'claude', ...patch };
}

const sessions = [
  session('s-ledger', 'ledger-api', goji),
  session('s-scratch', 'scratch'),
  session('s-atlas', 'atlas-web', goji),
  session('s-dots', 'dotfiles', personal),
  session('s-old', 'search-indexer', goji),
  session('s-zzz', 'claims-portal', personal),
];

const panes = [
  pane('p-ledger', 's-ledger', { agentState: 'working', since: NOW - 60_000 }),
  pane('p-ledger-h', 's-ledger', { hibernated: true }),
  pane('p-atlas', 's-atlas', { agentState: 'done', since: NOW - 3 * 60 * 60_000 }),
  pane('p-scratch', 's-scratch', { agent: undefined, title: 'zsh', running: true }),
  pane('p-dots', 's-dots', { agentState: 'done', since: NOW - 2 * 60 * 60_000 }),
  pane('p-old', 's-old', { agentState: 'done', since: NOW - 4 * DAY_MS }),
  pane('p-zzz', 's-zzz', { hibernated: true }),
];

const keys = (sections: ReturnType<typeof workspaceSections>) => sections.map((section) => [section.key, section.rows.map((row) => row.session.name), section.open]);

describe('Workspaces', () => {
  it('PHA-C4 lists ungrouped workspaces first, then groups in the desktop order, and Sleeping last', () => {
    expect(keys(workspaceSections(sessions, panes, [], {}, NOW, []))).toEqual([
      ['ungrouped', ['scratch'], true],
      ['group:g-goji', ['ledger-api', 'atlas-web'], false],
      ['group:g-personal', ['dotfiles'], false],
      ['sleeping', ['search-indexer', 'claims-portal'], false],
    ]);
  });

  it('PHA-C5 opens a group by itself when a member needs you and keeps the human\'s fold otherwise', () => {
    const ask: Ask = { askId: 'a', sessionId: 's-dots', paneId: 'p-dots', kind: 'question', title: '?', choices: [], allowText: true, since: NOW };
    const sections = workspaceSections(sessions, panes, [ask], {}, NOW, ['sleeping']);
    expect(keys(sections).map(([key, , open]) => [key, open])).toEqual([
      ['ungrouped', true],
      ['group:g-goji', false],
      ['group:g-personal', true],
      ['sleeping', true],
    ]);
    expect(sections[2].needs).toBe(1);
  });

  it('PHA-C6 finds workspaces and sessions in one list and marks the match', () => {
    const hits = search('led', sessions, [...panes, pane('p-codex', 's-old', { agent: 'codex', title: 'codex', agentMessage: 'round each ledger line' })], {}, NOW);
    expect(hits.map((hit) => (hit.kind === 'workspace' ? `w:${hit.session.name}` : `p:${hit.pane.paneId}`))).toEqual(['w:ledger-api', 'p:p-ledger', 'p:p-ledger-h', 'p:p-codex']);
    expect(matchRange('round each ledger line', 'LED')).toEqual([11, 14]);
    expect(search('  ', sessions, panes, {}, NOW)).toEqual([]);
  });

  it('PHA-C7 splits a workspace into active, idle and hibernated sessions', () => {
    const own = [
      pane('p-work', 's', { agentState: 'working', since: NOW - 60_000 }),
      pane('p-wait', 's', { agentState: 'waiting', since: NOW - 30_000 }),
      pane('p-done', 's', { agentState: 'done', since: NOW - DAY_MS }),
      pane('p-shell', 's', { agent: undefined, title: 'zsh', running: false, lastExitCode: 1 }),
      pane('p-sleep', 's', { hibernated: true }),
      { paneId: 'p-browser', sessionId: 's', kind: 'browser', title: 'localhost', running: false, blockCount: 0 },
    ];
    const split = paneSections(own, {});
    expect(split.active.map((p) => p.paneId)).toEqual(['p-wait', 'p-work', 'p-shell']);
    expect(split.idle.map((p) => p.paneId)).toEqual(['p-done']);
    expect(split.hibernated.map((p) => p.paneId)).toEqual(['p-sleep']);
  });

  it('sums a workspace up in one line', () => {
    expect(workspaceSummary([pane('a', 's', { agentState: 'working' }), pane('b', 's', { hibernated: true })], {}, NOW)).toBe('1 active · 1 hibernated');
    expect(workspaceSummary([pane('a', 's', { agentState: 'working' }), pane('b', 's', { agent: undefined, title: 'zsh' })], {}, NOW)).toBe('1 working · 1 shell');
    expect(workspaceSummary([pane('a', 's', { agentState: 'error', since: NOW - 60 * 60_000 })], {}, NOW)).toBe('Failed 1 h');
    expect(workspaceSummary([pane('a', 's', { agentState: 'done', since: NOW - 2 * DAY_MS })], {}, NOW)).toBe('Idle for 2 days');
    expect(workspaceSummary([pane('a', 's', { agentState: 'done' })], {}, NOW)).toBe('1 agent');
    expect(workspaceSummary([], {}, NOW)).toBe('Empty');
  });
});
