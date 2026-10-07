import { describe, expect, it } from 'vitest';
import { attentionRank, byAttention, homeSections } from './order';
import { acceptsSwipe, afterClose, step } from './terminalPager';
import type { Pane, Session } from './workspaces';

function pane(paneId: string, extra: Partial<Pane> = {}): Pane {
  return { paneId, sessionId: 's', kind: 'terminal', title: paneId, running: false, blockCount: 0, ...extra };
}

function session(sessionId: string, group?: string): Session {
  return { sessionId, name: sessionId, kind: 'project', workDir: '/w', state: 'idle', ...(group ? { group: { id: group, name: group } } : {}) };
}

describe('ordering', () => {
  it('NAV-C1 puts needs-you first, then running, then the rest, keeping desktop order in each band', () => {
    const panes = [
      pane('idle1'),
      pane('run1', { running: true }),
      pane('wait1', { agentState: 'waiting', running: true }),
      pane('fail1', { lastExitCode: 1 }),
      pane('idle2'),
      pane('run2', { running: true }),
    ];
    expect(byAttention(panes, attentionRank).map((p) => p.paneId)).toEqual(['wait1', 'fail1', 'run1', 'run2', 'idle1', 'idle2']);
  });

  it('NAV-C12 moves an agent that fails above one that runs', () => {
    const before = [pane('a', { running: true }), pane('b', { running: true })];
    const after = [before[0], pane('b', { agentState: 'error' })];
    expect(byAttention(after, attentionRank).map((p) => p.paneId)).toEqual(['b', 'a']);
  });
});

describe('terminal pager', () => {
  it('NAV-C2 moves to the next terminal', () => {
    expect(step(1, 1, 3)).toBe(2);
    expect(step(1, -1, 3)).toBe(0);
  });

  it('NAV-C3 stays on the last terminal when swiping past it', () => {
    expect(step(2, 1, 3)).toBe(2);
    expect(step(0, -1, 3)).toBe(0);
  });

  it('NAV-C4 leaves swipes that start near either edge to system back', () => {
    expect(acceptsSwipe(10, 360)).toBe(false);
    expect(acceptsSwipe(350, 360)).toBe(false);
    expect(acceptsSwipe(180, 360)).toBe(true);
  });

  it('NAV-C7 shows the terminal that took the closed one’s place, or none when it was the only one', () => {
    expect(afterClose(['a', 'b', 'c'], ['a', 'c'], 'b')).toBe('c');
    expect(afterClose(['a', 'b'], ['a'], 'b')).toBe('a');
    expect(afterClose(['a'], [], 'a')).toBeNull();
    expect(afterClose(['a', 'b'], ['a', 'b'], 'b')).toBe('b');
  });
});

describe('home groups', () => {
  it('NAV-C8 shows group headings and Other when workspaces span more than one group', () => {
    const sections = homeSections([session('w1', 'Clients'), session('w2'), session('w3', 'Personal'), session('w4', 'Clients')]);
    expect(sections.map((s) => [s.title, s.sessions.map((x) => x.sessionId)])).toEqual([
      ['Clients', ['w1', 'w4']],
      ['Personal', ['w3']],
      ['Other', ['w2']],
    ]);
  });

  it('NAV-C9 shows one Workspaces heading with one group or none', () => {
    expect(homeSections([session('w1', 'Clients'), session('w2', 'Clients')]).map((s) => s.title)).toEqual(['Workspaces']);
    expect(homeSections([session('w1'), session('w2')]).map((s) => s.title)).toEqual(['Workspaces']);
  });
});
