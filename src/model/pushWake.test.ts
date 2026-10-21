import { describe, expect, it } from 'vitest';
import { pruneRaised, RAISED_MAX_IDS, RAISED_MEMORY_MS } from './pushWake';

describe('remembering raised alerts', () => {
  it('PSH-W10 drops entries older than 24 hours', () => {
    const now = 10 * RAISED_MEMORY_MS;
    expect(pruneRaised({ old: now - RAISED_MEMORY_MS - 1, fresh: now - 1000 }, now)).toEqual({ fresh: now - 1000 });
  });

  it('PSH-W11 keeps at most 200 ids, the newest', () => {
    const now = 10 * RAISED_MEMORY_MS;
    const many = Object.fromEntries(Array.from({ length: RAISED_MAX_IDS + 50 }, (_, i) => [`ask:${i}`, now - 1000 + i]));
    const kept = pruneRaised(many, now);
    expect(Object.keys(kept)).toHaveLength(RAISED_MAX_IDS);
    expect(kept[`ask:${RAISED_MAX_IDS + 49}`]).toBeDefined();
    expect(kept['ask:0']).toBeUndefined();
  });

  it('PSH-W15 caps prompt keys apart from ask ids, so prompts never evict a dismissed ask', () => {
    const now = 10 * RAISED_MEMORY_MS;
    const prompts = Object.fromEntries(Array.from({ length: RAISED_MAX_IDS + 100 }, (_, i) => [`p${i}:waiting:${i}`, now - 10 + i]));
    const kept = pruneRaised({ 'ask:old': now - RAISED_MEMORY_MS + 1000, ...prompts }, now);
    expect(kept['ask:old']).toBeDefined();
    expect(Object.keys(kept).filter((key) => key.startsWith('p'))).toHaveLength(RAISED_MAX_IDS);
  });
});
