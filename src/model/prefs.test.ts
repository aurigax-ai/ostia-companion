import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs } from './prefs';

describe('terminal options', () => {
  it('SET-C4 defaults to size 13 with key row and haptics on', () => {
    expect(parsePrefs(null)).toEqual({ fontSize: 13, keyRow: true, haptics: true });
  });

  it('SET-C5 clamps the size, fills a missing option and drops unknown keys', () => {
    expect(parsePrefs(JSON.stringify({ fontSize: 40, keyRow: false, colour: 'red' }))).toEqual({
      fontSize: 18,
     
      keyRow: false,
      haptics: true,
    });
  });

  it('SET-C6 falls back to every default when the stored text is not JSON', () => {
    expect(parsePrefs('{fontSize:')).toEqual(DEFAULT_PREFS);
  });
});
