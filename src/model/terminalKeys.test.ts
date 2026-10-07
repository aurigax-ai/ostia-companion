import { describe, expect, it } from 'vitest';
import { KeyRowState, pressKeyRow } from './terminalKeys';

const OFF: KeyRowState = { ctrl: false };
const ON: KeyRowState = { ctrl: true };

describe('terminal key row', () => {
  it('CRD-C23 sends the escape sequences for arrows, esc, tab and enter', () => {
    const sent = (['up', 'down', 'left', 'right', 'esc', 'tab', 'enter'] as const).map(
      (key) => pressKeyRow(OFF, { type: 'key', key }).send,
    );
    expect(sent).toEqual(['\x1b[A', '\x1b[B', '\x1b[D', '\x1b[C', '\x1b', '\t', '\r']);
  });

  it('CRD-C24 ctrl then "c" sends 0x03 and turns ctrl off', () => {
    expect(pressKeyRow(ON, { type: 'text', text: 'c' })).toEqual({ state: OFF, send: '\x03' });
  });

  it('CRD-C25 ctrl then a character with no control form sends it unchanged and turns ctrl off', () => {
    expect(pressKeyRow(ON, { type: 'text', text: '1' })).toEqual({ state: OFF, send: '1' });
  });

  it('CRD-C26 tapping ctrl again turns it off and sends nothing', () => {
    expect(pressKeyRow(ON, { type: 'ctrl' })).toEqual({ state: OFF, send: null });
    expect(pressKeyRow(OFF, { type: 'ctrl' })).toEqual({ state: ON, send: null });
  });
});
