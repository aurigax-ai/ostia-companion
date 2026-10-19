import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutsFor } from './shortcuts';

const names = (text: string, phone = true) => shortcutsFor(text, phone).map((shortcut) => shortcut.name);

describe('slash shortcuts', () => {
  it('PHA-C9 lists the shortcuts after a slash, narrows as letters come, and fills a sentence', () => {
    expect(names('/')).toEqual(['/summary', '/status', '/review', '/storage', '/later']);
    expect(names('/s')).toEqual(['/summary', '/status', '/storage']);
    expect(names('/st')).toEqual(['/status', '/storage']);
    expect(names('hello /s')).toEqual([]);
    expect(names('/status now')).toEqual([]);
    expect(SHORTCUTS.find((shortcut) => shortcut.name === '/review')!.fill('ledger-api')).toBe('Review the last changes in ledger-api');
  });

  it('PHA-C10 does not offer /storage without phone control', () => {
    expect(names('/', false)).toEqual(['/summary', '/status', '/review', '/later']);
  });
});
