import { describe, expect, it } from 'vitest';
import { decideRequest, DEFAULT_PHONE_CONTROL, parsePhoneControl, parsePhoneControlByDesktop, toggleChosen } from './phoneControlPrefs';

describe('phone control allow mode', () => {
  it('asks every time by default, with view and tap for 15 minutes behind the fingerprint', () => {
    expect(parsePhoneControl(undefined)).toEqual({ mode: 'ask', chosen: [], level: 'control', limit: 15, fingerprint: true });
    expect(decideRequest(DEFAULT_PHONE_CONTROL, 's-a', true)).toBe('ask');
  });

  it('PHA-C14 declines everything when Off', () => {
    expect(decideRequest({ ...DEFAULT_PHONE_CONTROL, mode: 'off', chosen: ['s-a'] }, 's-a', true)).toBe('off');
  });

  it('PHA-C15 skips the question only for ticked workspaces', () => {
    const prefs = toggleChosen({ ...DEFAULT_PHONE_CONTROL, mode: 'chosen' }, 's-ledger');
    expect(decideRequest(prefs, 's-ledger', true)).toBe('allow');
    expect(decideRequest(prefs, 's-atlas', true)).toBe('ask');
    expect(toggleChosen(prefs, 's-ledger').chosen).toEqual([]);
  });

  it('PHA-C20 declines on a phone without phone control whatever the mode', () => {
    expect(decideRequest({ ...DEFAULT_PHONE_CONTROL, mode: 'chosen', chosen: ['s-a'] }, 's-a', false)).toBe('unsupported');
  });

  it('reads saved settings per desktop and drops what it does not know', () => {
    const saved = parsePhoneControlByDesktop('{"dev_1":{"mode":"chosen","chosen":["s",4],"level":"view","limit":30,"fingerprint":false},"dev_2":{"mode":"always","limit":7}}');
    expect(saved).toEqual({
      dev_1: { mode: 'chosen', chosen: ['s'], level: 'view', limit: 30, fingerprint: false },
      dev_2: DEFAULT_PHONE_CONTROL,
    });
    expect(parsePhoneControlByDesktop('[1]')).toEqual({});
    expect(parsePhoneControlByDesktop('{')).toEqual({});
  });
});
