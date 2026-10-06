import { describe, expect, it } from 'vitest';
import {
  Pane,
  Session,
  applyPaneUpdate,
  applySessionState,
  failedExit,
  needsYou,
  paneSubtitle,
  paneSummary,
  paneTitle,
  shortPath,
} from './workspaces';

function session(sessionId: string, name: string): Session {
  return { sessionId, name, kind: 'project', workDir: `/home/me/${name}`, state: 'idle' };
}

function pane(paneId: string, sessionId: string, extra: Partial<Pane> = {}): Pane {
  return { paneId, sessionId, kind: 'terminal', title: paneId, running: false, blockCount: 0, ...extra };
}

describe('needsYou', () => {
  it('lists panes whose agent waits or failed, named by their workspace', () => {
    const items = needsYou(
      [session('s1', 'api'), session('s2', 'web')],
      [
        pane('p1', 's1', { agentState: 'waiting', agentMessage: 'Allow Bash?' }),
        pane('p2', 's1', { agentState: 'working' }),
        pane('p3', 's2', { agentState: 'error' }),
        pane('p4', 's2'),
      ],
    );
    expect(items.map((item) => [item.pane.paneId, item.workspace, item.reason])).toEqual([
      ['p1', 'api', 'Allow Bash?'],
      ['p3', 'web', 'Stopped with an error'],
    ]);
  });

  it('says the agent is waiting when it sent no message', () => {
    expect(needsYou([], [pane('p1', 's1', { agentState: 'waiting' })])[0].reason).toBe('Waiting for you');
  });
});

describe('shortPath', () => {
  it('replaces a Linux or macOS home folder with ~', () => {
    expect(shortPath('/home/mtchen/Personal/terminal')).toBe('~/Personal/terminal');
    expect(shortPath('/Users/ann')).toBe('~');
    expect(shortPath('/homes/x')).toBe('/homes/x');
    expect(shortPath(undefined)).toBe('');
  });
});

describe('paneSummary', () => {
  it('counts running panes first, then all panes', () => {
    expect(paneSummary([])).toBe('No panes');
    expect(paneSummary([pane('a', 's'), pane('b', 's', { running: true })])).toBe('1 running');
    expect(paneSummary([pane('a', 's')])).toBe('1 pane');
    expect(paneSummary([pane('a', 's'), pane('b', 's')])).toBe('2 panes');
  });
});

describe('failedExit', () => {
  it('reports a non-zero exit only once the command stopped', () => {
    expect(failedExit(pane('a', 's', { lastExitCode: 2 }))).toBe(2);
    expect(failedExit(pane('a', 's', { lastExitCode: 2, running: true }))).toBeNull();
    expect(failedExit(pane('a', 's', { lastExitCode: 0 }))).toBeNull();
  });
});

describe('updates', () => {
  it('changes only the named pane and session', () => {
    const panes = applyPaneUpdate([pane('a', 's'), pane('b', 's')], { paneId: 'b', running: true });
    expect(panes.map((p) => p.running)).toEqual([false, true]);
    const sessions = applySessionState([session('s1', 'x'), session('s2', 'y')], 's2', 'waiting');
    expect(sessions.map((s) => s.state)).toEqual(['idle', 'waiting']);
  });
});

describe('paneTitle', () => {
  it('drops the spinner an agent puts before its title', () => {
    expect(paneTitle(pane('a', 's', { title: '\u2733 Agent design' }))).toBe('Agent design');
    expect(paneTitle(pane('a', 's', { title: '\u25d1 Mobile design' }))).toBe('Mobile design');
    expect(paneTitle(pane('a', 's', { title: '~/src' }))).toBe('~/src');
    expect(paneTitle(pane('a', 's', { title: '' }))).toBe('Terminal');
  });
});

describe('paneSubtitle', () => {
  it('names the agent when the pane sits in the workspace folder, else its folder', () => {
    const dir = '/home/me/api';
    expect(paneSubtitle(pane('a', 's', { cwd: dir, agent: 'claude' }), dir)).toBe('claude');
    expect(paneSubtitle(pane('a', 's', { cwd: '/home/me/web', agent: 'claude' }), dir)).toBe('~/web');
    expect(paneSubtitle(pane('a', 's', { cwd: dir }), dir)).toBe('~/api');
    expect(paneSubtitle(pane('a', 's', { agentState: 'waiting', agentMessage: 'Allow?' }), dir)).toBe('Allow?');
  });
});
