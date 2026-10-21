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
});
