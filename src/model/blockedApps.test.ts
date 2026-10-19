import { describe, expect, it } from 'vitest';
import { blockedSummary, parseBlocked, toggleBlocked } from './blockedApps';

describe('blocked apps', () => {
  it('keeps only package names, once each', () => {
    expect(parseBlocked('["com.bank.app","com.bank.app","rm -rf",3]')).toEqual(['com.bank.app']);
    expect(parseBlocked('not json')).toEqual([]);
    expect(parseBlocked(null)).toEqual([]);
  });

  it('adds and removes an app', () => {
    expect(toggleBlocked(['com.a.b'], 'com.c.d', true)).toEqual(['com.a.b', 'com.c.d']);
    expect(toggleBlocked(['com.a.b', 'com.c.d'], 'com.a.b', false)).toEqual(['com.c.d']);
    expect(toggleBlocked([], 'bad name', true)).toEqual([]);
  });

  it('sums up what is never opened', () => {
    expect(blockedSummary(0)).toBe('Password managers, authenticators, payments');
    expect(blockedSummary(2)).toBe('Password managers, authenticators, payments and 2 more');
  });
});
