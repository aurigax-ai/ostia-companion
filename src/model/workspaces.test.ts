import { describe, expect, it } from 'vitest';
import {
  Pane,
  Session,
  applyPaneUpdate,
  applySessionState,
  failedExit,
  groupPanes,
  isOpenable,
  paneScreen,
  paneStatus,
  paneSubtitle,
  paneTitle,
  shortPath,
  workspaceStatus,
} from './workspaces';

function session(sessionId: string, name: string): Session {
  return { sessionId, name, kind: 'project', workDir: `/home/me/${name}`, state: 'idle' };
}

function pane(paneId: string, sessionId: string, extra: Partial<Pane> = {}): Pane {
  return { paneId, sessionId, kind: 'terminal', title: paneId, running: false, blockCount: 0, ...extra };
}

describe('shortPath', () => {
  it('replaces a Linux or macOS home folder with ~', () => {
    expect(shortPath('/home/mtchen/Personal/terminal')).toBe('~/Personal/terminal');
    expect(shortPath('/Users/ann')).toBe('~');
    expect(shortPath('/homes/x')).toBe('/homes/x');
    expect(shortPath(undefined)).toBe('');
  });
});

describe('status', () => {
  it('CRD-C1 a waiting agent is Waiting even while its command runs', () => {
    expect(paneStatus(pane('a', 's', { agentState: 'waiting', running: true }))).toEqual({
      kind: 'waiting',
      tone: 'attn',
      text: 'Waiting',
    });
  });

  it('CRD-C2 a workspace with two running panes is "2 running"', () => {
    const panes = [pane('a', 's', { running: true }), pane('b', 's', { running: true }), pane('c', 's')];
    expect(workspaceStatus(session('s', 'api'), panes)).toEqual({ kind: 'running', tone: 'brand', text: '2 running' });
  });

  it('CRD-C3 a pane that exited 0 is idle, not a failure', () => {
    expect(paneStatus(pane('a', 's', { lastExitCode: 0 }))).toEqual({ kind: 'idle', tone: 'muted', text: 'Idle' });
  });

  it('CRD-C4 a workspace with no panes is "No panes"', () => {
    expect(workspaceStatus(session('s', 'api'), [])).toEqual({ kind: 'idle', tone: 'muted', text: 'No panes' });
  });

  it('ranks agent error and failed exits above running, and done above idle', () => {
    expect(paneStatus(pane('a', 's', { agentState: 'error', running: true })).text).toBe('Error');
    expect(paneStatus(pane('a', 's', { lastExitCode: 2 })).text).toBe('Exit 2');
    expect(paneStatus(pane('a', 's', { agentState: 'done' })).kind).toBe('done');
    expect(workspaceStatus(session('s', 'api'), [pane('a', 's'), pane('b', 's')]).text).toBe('2 panes');
    expect(workspaceStatus(session('s', 'api'), [pane('a', 's', { lastExitCode: 1 })]).text).toBe('Exit 1');
  });
});

describe('groupPanes', () => {
  it('CRD-C7 puts terminals first and every other kind under desktop only, in desktop order', () => {
    const groups = groupPanes([
      pane('t1', 's'),
      pane('b1', 's', { kind: 'browser' }),
      pane('t2', 's'),
      pane('e1', 's', { kind: 'editor' }),
    ]);
    expect(groups.map((group) => [group.title, group.panes.map((p) => p.paneId)])).toEqual([
      ['Terminals', ['t1', 't2']],
      ['Desktop only', ['b1', 'e1']],
    ]);
  });

  it('CRD-C8 leaves out the terminals group when there are none', () => {
    const groups = groupPanes([pane('b1', 's', { kind: 'browser' })]);
    expect(groups.map((group) => group.title)).toEqual(['Desktop only']);
  });
});

describe('the pi Agent pane', () => {
  it('PHP-C3 opens as a chat, and sits with the terminals rather than under desktop only', () => {
    const pi = pane('pi', 's', { kind: 'agent' });
    expect(paneScreen(pi)).toBe('Conversation');
    expect(isOpenable(pi)).toBe(true);
    expect(isOpenable(pane('b', 's', { kind: 'browser' }))).toBe(false);
    expect(groupPanes([pane('t', 's'), pi, pane('b', 's', { kind: 'browser' })]).map((g) => [g.title, g.panes.map((p) => p.paneId)])).toEqual([
      ['Terminals', ['t', 'pi']],
      ['Desktop only', ['b']],
    ]);
  });

  it('PHP-C3 the other kinds keep their screen', () => {
    expect(paneScreen(pane('c', 's', { agent: 'claude' }))).toBe('Conversation');
    expect(paneScreen(pane('z', 's'))).toBe('Terminal');
    expect(paneScreen(pane('e', 's', { kind: 'editor' }))).toBe('Terminal');
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

  it('shows the folder instead of repeating an agent name that is already the title', () => {
    expect(paneSubtitle(pane('a', 's', { title: 'claude', cwd: '/home/me/api', agent: 'claude' }), '/home/me/api')).toBe('~/api');
  });
});
