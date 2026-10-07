import { describe, expect, it } from 'vitest';
import type { Ask } from './asks';
import { DEFAULT_ALERT_PREFS as DEFAULT_PREFS } from './alertPrefs';
import { actionFor, alertForAsk, alertsFromChange, tapTarget, watchState } from './agentAlerts';
import type { Pane, Session } from './workspaces';

const sessions: Session[] = [{ sessionId: 's', name: 'api-server', kind: 'project', workDir: '/w', state: 'idle' }];

function agent(state: Pane['agentState'], message?: string): Pane {
  return { paneId: 'p-claude', sessionId: 's', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agent: 'claude', agentState: state, agentMessage: message };
}

const PERMISSION: Ask = {
  askId: 'ask-1',
  sessionId: 's',
  paneId: 'p-claude',
  kind: 'permission',
  agent: 'claude',
  title: 'Run Bash: npm test?',
  choices: [
    { id: 'allow-once', label: 'Allow once', tone: 'approve' },
    { id: 'allow-always', label: 'Always allow', tone: 'neutral' },
    { id: 'deny', label: 'Deny', tone: 'deny' },
  ],
  allowText: false,
  since: 0,
};

describe('agent alerts', () => {
  it('NTF-C1 alerts once when an agent starts waiting, with its message', () => {
    const alerts = alertsFromChange([agent('working')], [agent('waiting', 'Apply this migration?')], sessions, DEFAULT_PREFS);
    expect(alerts).toEqual([
      expect.objectContaining({ paneId: 'p-claude', title: 'claude in api-server needs you', body: 'Apply this migration?' }),
    ]);
  });

  it('NTF-C2 does not alert again for the same waiting state', () => {
    expect(alertsFromChange([agent('waiting', 'x')], [agent('waiting', 'x')], sessions, DEFAULT_PREFS)).toEqual([]);
  });

  it('NTF-C3 skips finished alerts when they are off but still alerts a failure', () => {
    const prefs = { ...DEFAULT_PREFS, done: false };
    expect(alertsFromChange([agent('working')], [agent('done')], sessions, prefs)).toEqual([]);
    expect(alertsFromChange([agent('working')], [agent('error')], sessions, prefs)).toEqual([
      expect.objectContaining({ title: 'claude in api-server failed' }),
    ]);
  });

  it('NTF-C4 runs the watch service while an agent works and stops when none does', () => {
    expect(watchState([agent('working')], DEFAULT_PREFS, 'android', 'Studio Linux')).toEqual({ run: true, text: 'Watching 1 agent on Studio Linux' });
    expect(watchState([agent('done')], DEFAULT_PREFS, 'android', 'Studio Linux')).toEqual({ run: false, text: '' });
  });

  it('NTF-C5 never runs the service with every alert kind off', () => {
    const off = { waiting: false, done: false, failed: false };
    expect(watchState([agent('working')], off, 'android', 'Studio Linux').run).toBe(false);
  });

  it('NTF-C6 opens the terminal an alert is about', () => {
    expect(tapTarget({ paneId: 'p-claude', paneTitle: 'claude' })).toEqual({ screen: 'Terminal', params: { paneId: 'p-claude', title: 'claude' } });
  });

  it('NTF-C8 requests no background service on iOS', () => {
    expect(watchState([agent('working')], DEFAULT_PREFS, 'ios', 'Studio Linux').run).toBe(false);
  });

  it('NTF-C9 gives a permission ask Approve behind unlock and Deny; a question its choices and Reply', () => {
    expect(alertForAsk(PERMISSION, sessions).actions).toEqual([
      { id: 'allow-once', label: 'Approve', unlock: true },
      { id: 'deny', label: 'Deny', unlock: false },
    ]);
    const question: Ask = { ...PERMISSION, askId: 'q', kind: 'question', allowText: true, choices: [
      { id: 'a', label: 'Staging', tone: 'neutral' }, { id: 'b', label: 'Production', tone: 'neutral' },
      { id: 'c', label: 'Both', tone: 'neutral' }, { id: 'd', label: 'Neither', tone: 'neutral' },
    ] };
    expect(alertForAsk(question, sessions).actions).toEqual([
      { id: 'a', label: 'Staging', unlock: false },
      { id: 'b', label: 'Production', unlock: false },
      { id: 'c', label: 'Both', unlock: false },
      { id: 'reply', label: 'Reply', unlock: false, reply: true },
    ]);
  });

  it('NTF-C10 Deny from the alert answers the deny choice and removes the alert', () => {
    expect(actionFor('ask-1', 'deny', undefined, [PERMISSION])).toEqual({ answer: { askId: 'ask-1', choiceId: 'deny' }, dismiss: true });
    expect(actionFor('ask-1', 'reply', 'use staging', [{ ...PERMISSION, allowText: true }])).toEqual({
      answer: { askId: 'ask-1', text: 'use staging' },
      dismiss: true,
    });
  });

  it('NTF-C11 an action on an ask already answered only removes the alert', () => {
    expect(actionFor('ask-1', 'deny', undefined, [])).toEqual({ answer: null, dismiss: true });
  });

  it('NTF-C12 raises nothing for states already present when the desktop first loads', () => {
    expect(alertsFromChange([], [agent('waiting', 'x'), { ...agent('done'), paneId: 'p-2' }], sessions, DEFAULT_PREFS)).toEqual([]);
  });
});
