import { describe, expect, it } from 'vitest';
import { detailPreview, waitedFor } from './asks';

describe('asks', () => {
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
