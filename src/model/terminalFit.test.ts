import { describe, expect, it } from 'vitest';
import { MIN_WATCH_FONT_SIZE, TERMINAL_FONT_SIZE, watchFontSize } from './terminalFit';

describe('watchFontSize', () => {
  it('shrinks the font so the desktop width fits on the phone', () => {
    expect(watchFontSize({ cols: 48, fontSize: 13 }, 96)).toBe(6.5);
    expect(watchFontSize({ cols: 60, fontSize: 10 }, 80)).toBe(7.5);
  });

  it('never grows past the normal size or below the smallest readable size', () => {
    expect(watchFontSize({ cols: 48, fontSize: 13 }, 40)).toBe(TERMINAL_FONT_SIZE);
    expect(watchFontSize({ cols: 48, fontSize: 13 }, 400)).toBe(MIN_WATCH_FONT_SIZE);
  });

  it('keeps the normal size before anything is measured', () => {
    expect(watchFontSize({ cols: 0, fontSize: 13 }, 120)).toBe(TERMINAL_FONT_SIZE);
  });
});
