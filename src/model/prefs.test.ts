import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs, terminalFontSize } from './prefs';

describe('terminal options', () => {
  it('SET-C4 defaults to size 13 with fit, key row and haptics on', () => {
    expect(parsePrefs(null)).toEqual({ fontSize: 13, fitWhenWatching: true, keyRow: true, haptics: true });
  });

  it('SET-C5 clamps the size, fills a missing option and drops unknown keys', () => {
    expect(parsePrefs(JSON.stringify({ fontSize: 40, keyRow: false, colour: 'red' }))).toEqual({
      fontSize: 18,
      fitWhenWatching: true,
      keyRow: false,
      haptics: true,
    });
  });

  it('SET-C6 falls back to every default when the stored text is not JSON', () => {
    expect(parsePrefs('{fontSize:')).toEqual(DEFAULT_PREFS);
  });

  it('SET-C7 uses the typing size when watching if fit is off', () => {
    const measured = { cols: 40, fontSize: 13 };
    expect(terminalFontSize('observer', { ...DEFAULT_PREFS, fontSize: 15, fitWhenWatching: false }, measured, 120)).toBe(15);
    expect(terminalFontSize('observer', { ...DEFAULT_PREFS, fontSize: 15 }, measured, 120)).toBeLessThan(13);
    expect(terminalFontSize('owner', { ...DEFAULT_PREFS, fontSize: 16 }, measured, 120)).toBe(16);
  });
});
