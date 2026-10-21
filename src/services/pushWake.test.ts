import { describe, expect, it, vi } from 'vitest';
import type { AgentAlert } from '../model/agentAlerts';
import type { Ask } from '../model/asks';
import { runWake, type WakeDeps } from './pushWake';

const ask = (askId: string, paneId = 'p1'): Ask => ({
  askId,
  sessionId: 's1',
  paneId,
  kind: 'permission',
  agent: 'claude',
  title: 'Apply this migration?',
  choices: [
    { id: 'yes', label: 'Yes', tone: 'approve' },
    { id: 'no', label: 'No', tone: 'deny' },
  ],
  allowText: false,
  since: 1,
});

const pane = (paneId: string, agentState: string) => ({
  paneId,
  sessionId: 's1',
  kind: 'agent',
  title: 'claude',
  running: true,
  blockCount: 0,
  agent: 'claude',
  agentState,
  agentMessage: 'Ready for the next prompt',
});

interface Setup {
  asks?: Ask[];
  panes?: ReturnType<typeof pane>[];
  presented?: string[];
  raised?: string[];
  prefs?: WakeDeps['prefs'];
  connect?: WakeDeps['connect'];
  call?: WakeDeps['call'];
}

function deps(setup: Setup = {}) {
  const posted: AgentAlert[] = [];
  const release = vi.fn();
  const calls: string[] = [];
  const value: WakeDeps = {
    connect: setup.connect ?? (async () => ({ release })),
    call:
      setup.call ??
      (async (method) => {
        calls.push(method);
        if (method === 'ask.list') return { asks: setup.asks ?? [ask('a1')] };
        if (method === 'pane.list') return { panes: setup.panes ?? [] };
        return { sessions: [{ sessionId: 's1', name: 'api-server', kind: 'agent', workDir: '/w', state: 'waiting' }] };
      }),
    presentedIds: async () => setup.presented ?? [],
    raisedIds: async () => setup.raised ?? [],
    prefs: setup.prefs ?? (() => ({ waiting: true, done: true, failed: true })),
    post: async (alert) => void posted.push(alert),
  };
  return { value, posted, release, calls };
}

describe('waking from a push (contract v1.14 §5)', () => {
  it('PSH-W1 reads ask.list, session.list and pane.list and raises one alert for the open ask', async () => {
    const { value, posted, calls, release } = deps();
    expect(await runWake(value)).toBe(1);
    expect(calls.sort()).toEqual(['ask.list', 'pane.list', 'session.list']);
    expect(posted).toHaveLength(1);
    expect(posted[0].id).toBe('ask:a1');
    expect(posted[0].title).toBe('claude in api-server');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('PSH-W2 raises nothing for an ask whose alert is already showing', async () => {
    const { value, posted } = deps({ presented: ['ask:a1'] });
    expect(await runWake(value)).toBe(0);
    expect(posted).toEqual([]);
  });

  it('PSH-W3 raises only the new ask when another one is already showing', async () => {
    const { value, posted } = deps({ asks: [ask('a1'), ask('a2')], presented: ['ask:a1'] });
    await runWake(value);
    expect(posted.map((a) => a.id)).toEqual(['ask:a2']);
  });

  it('PSH-W4 raises nothing when waiting alerts are off', async () => {
    const { value, posted } = deps({ prefs: () => ({ waiting: false, done: true, failed: true }) });
    await runWake(value);
    expect(posted).toEqual([]);
  });

  it('PSH-W5 does nothing when no connection could be made', async () => {
    const { value, posted, calls } = deps({ connect: async () => null });
    expect(await runWake(value)).toBe(0);
    expect(calls).toEqual([]);
    expect(posted).toEqual([]);
  });

  it('PSH-W6 lets go of the connection even when a read fails', async () => {
    const release = vi.fn();
    const { value } = deps({ connect: async () => ({ release }), call: async () => Promise.reject(new Error('down')) });
    await expect(runWake(value)).rejects.toThrow('down');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('PSH-W7 does not raise again an alert the human already dismissed', async () => {
    const { value, posted } = deps({ raised: ['ask:a1'] });
    expect(await runWake(value)).toBe(0);
    expect(posted).toEqual([]);
  });

  it('PSH-W8 raises an alert for an agent waiting for a prompt, once, and none for one with an open ask', async () => {
    const { value, posted } = deps({
      asks: [ask('a1', 'p1')],
      panes: [pane('p1', 'waiting'), pane('p2', 'waiting'), pane('p3', 'working'), pane('p4', 'done')],
    });
    await runWake(value);
    expect(posted.map((a) => a.id)).toEqual(['ask:a1', 'p2:waiting']);
    expect(posted[1].title).toBe('claude in api-server needs you');
  });

  it('PSH-W9 raises a prompt alert again for a new wait, and not while its alert is still showing', async () => {
    const wait = deps({ asks: [], panes: [pane('p2', 'waiting')], raised: ['p2:waiting'] });
    await runWake(wait.value);
    expect(wait.posted.map((a) => a.id)).toEqual(['p2:waiting']);
    const showing = deps({ asks: [], panes: [pane('p2', 'waiting')], presented: ['p2:waiting'] });
    await runWake(showing.value);
    expect(showing.posted).toEqual([]);
  });
});
