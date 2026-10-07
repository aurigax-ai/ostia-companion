import { describe, expect, it } from 'vitest';
import {
  Pane,
  Session,
  applyPaneUpdate,
  applySessionState,
  failedExit,
  groupPanes,
  needsYou,
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
      ['p3', 'web', 'Failed'],
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

describe('inbox', () => {
  it('CRD-C5 keeps a multi-line agent message whole', () => {
    const message = 'Apply this migration?\n\nALTER TABLE users\n  ADD COLUMN last_seen timestamptz;';
    const [item] = needsYou([session('s1', 'api')], [pane('p1', 's1', { agentState: 'waiting', agentMessage: message })]);
    expect(item.reason).toBe(message);
  });

  it('CRD-C6 a waiting agent with no message reads "Waiting for you"', () => {
    expect(needsYou([], [pane('p1', 's1', { agentState: 'waiting', agentMessage: '' })])[0].reason).toBe(
      'Waiting for you',
    );
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
