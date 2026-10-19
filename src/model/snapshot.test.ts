import { describe, expect, it } from 'vitest';
import { applyLoad, EMPTY_SNAPSHOT } from './snapshot';

const sessions = [{ sessionId: 's1', name: 'api', kind: 'project', workDir: '/w', state: 'idle' as const }];

describe('workspace snapshot', () => {
  it('CRD-C13 a successful load records when it happened', () => {
    const at = new Date(2026, 9, 6, 9, 38).getTime();
    const next = applyLoad(EMPTY_SNAPSHOT, { sessions, panes: [] }, at);
    expect(next.sessions).toEqual(sessions);
    expect(next.loadedAt).toBe(at);
    expect(next.error).toBeNull();
  });

  it('CRD-C14 a failed load keeps the earlier workspaces and their load time', () => {
    const loaded = applyLoad(EMPTY_SNAPSHOT, { sessions, panes: [] }, 1000);
    const failed = applyLoad(loaded, { error: 'WebSocket closed' }, 5000);
    expect(failed.sessions).toEqual(sessions);
    expect(failed.loadedAt).toBe(1000);
    expect(failed.error).toBe('WebSocket closed');
  });
});

describe('seen', () => {
  const pane = (paneId: string, agentState?: 'working' | 'done', hibernated?: boolean) =>
    ({ paneId, sessionId: 's', kind: 'terminal', title: 'claude', running: true, blockCount: 1, agentState, hibernated }) as const;

  it('PHA-C3 notes when the phone saw a pane change, and nothing on the first load', () => {
    const first = applyLoad(EMPTY_SNAPSHOT, { sessions: [], panes: [pane('a', 'working'), pane('b', 'working')] }, 1000);
    expect(first.seen).toEqual({});
    const second = applyLoad(first, { sessions: [], panes: [pane('a', 'done'), pane('b', 'working'), pane('c', 'working')] }, 2000);
    expect(second.seen).toEqual({ a: 2000, c: 2000 });
    const third = applyLoad(second, { sessions: [], panes: [pane('a', 'done'), pane('b', 'working', true)] }, 3000);
    expect(third.seen).toEqual({ a: 2000, b: 3000 });
  });
});
