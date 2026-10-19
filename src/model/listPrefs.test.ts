import { describe, expect, it } from 'vitest';
import { DEFAULT_LIST_PREFS, parseListPrefs, rememberSearch, toggleFold } from './listPrefs';

describe('list prefs', () => {
  it('PHA-C5 keeps the folds the human chose', () => {
    const open = toggleFold(DEFAULT_LIST_PREFS, 'group:g1');
    expect(open.unfolded).toEqual(['group:g1']);
    expect(toggleFold(open, 'group:g1').unfolded).toEqual([]);
  });

  it('keeps the five latest distinct searches, newest first', () => {
    let prefs = DEFAULT_LIST_PREFS;
    for (const query of ['a', 'b', ' a ', 'c', 'd', 'e', 'f', '  ']) prefs = rememberSearch(prefs, query);
    expect(prefs.recent).toEqual(['f', 'e', 'd', 'c', 'a']);
  });

  it('reads only strings back and survives a broken value', () => {
    expect(parseListPrefs('{"unfolded":["x",3],"recent":"no"}')).toEqual({ unfolded: ['x'], recent: [], lastChat: null });
    expect(parseListPrefs('not json')).toEqual(DEFAULT_LIST_PREFS);
  });
});
