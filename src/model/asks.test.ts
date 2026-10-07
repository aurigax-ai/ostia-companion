import { describe, expect, it } from 'vitest';
import { Ask, detailPreview, needsYouItems, waitedFor } from './asks';
import type { Pane, Session } from './workspaces';

function ask(askId: string, since: number, paneId = `p-${askId}`): Ask {
  return { askId, sessionId: 's', paneId, kind: 'permission', title: askId, choices: [], allowText: false, since };
}

const sessions: Session[] = [{ sessionId: 's', name: 'api', kind: 'project', workDir: '/w', state: 'waiting' }];

function pane(paneId: string, extra: Partial<Pane> = {}): Pane {
  return { paneId, sessionId: 's', kind: 'terminal', title: paneId, running: true, blockCount: 0, agent: 'claude', ...extra };
}

describe('asks', () => {
  it('AGT-C6 lists asks oldest first, then agents waiting without an ask', () => {
    const items = needsYouItems(
      [ask('new', 2_000), ask('old', 1_000)],
      sessions,
      [pane('p-new', { agentState: 'waiting' }), pane('p-idle', { agentState: 'waiting', agentMessage: 'Ready for input' })],
    );
    expect(items.map((item) => (item.kind === 'ask' ? item.ask.askId : item.item.pane.paneId))).toEqual(['old', 'new', 'p-idle']);
  });

  it('AGT-C9 previews six lines of a long detail', () => {
    const detail = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    expect(detailPreview(detail)).toEqual({ text: Array.from({ length: 6 }, (_, i) => `line ${i + 1}`).join('\n'), more: true });
    expect(detailPreview('one\ntwo')).toEqual({ text: 'one\ntwo', more: false });
  });

  it('AGT-C14 says how long an ask has waited', () => {
    const now = 10 * 60_000;
    expect(waitedFor(now - 3 * 60_000, now)).toBe('3 min');
    expect(waitedFor(now - 20_000, now)).toBe('just now');
    expect(waitedFor(now - 2 * 3_600_000, now - 0)).toBe('2 h');
  });
});
