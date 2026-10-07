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
