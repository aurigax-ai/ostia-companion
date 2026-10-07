import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { DEFAULT_PREFS } from './prefs';
import { hapticFor, listAnimation, pillFadeMs } from './motion';

describe('motion', () => {
  it('MOT-C1 animates list changes for 200 ms, easing in and out', () => {
    const config = listAnimation(false)!;
    expect(config.duration).toBe(200);
    expect([config.create?.type, config.update?.type, config.delete?.type]).toEqual([
      'easeInEaseOut',
      'easeInEaseOut',
      'easeInEaseOut',
    ]);
  });

  it('MOT-C2 configures no animation when reduce motion is on', () => {
    expect(listAnimation(true)).toBeNull();
    expect(pillFadeMs(true)).toBe(0);
  });

  it('MOT-C3 buzzes success when pairing is approved and a warning when it fails', () => {
    expect(hapticFor('approved', DEFAULT_PREFS)).toBe('success');
    expect(hapticFor('failed', DEFAULT_PREFS)).toBe('warning');
    expect(hapticFor('tap', DEFAULT_PREFS)).toBe('selection');
  });

  it('MOT-C4 fires no haptic when haptics are off', () => {
    const off = { ...DEFAULT_PREFS, haptics: false };
    expect([hapticFor('tap', off), hapticFor('approved', off), hapticFor('failed', off)]).toEqual([null, null, null]);
  });

  it('MOT-C5 fades a changed pill word in over 150 ms', () => {
    expect(pillFadeMs(false)).toBe(150);
  });

  it('MOT-C6 adds no animation library', () => {
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((dep) => /reanimated|moti|lottie/.test(dep))).toEqual([]);
  });
});
