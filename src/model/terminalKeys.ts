export type RowKey = 'esc' | 'tab' | 'up' | 'down' | 'left' | 'right' | 'enter';

export interface KeyRowState {
  ctrl: boolean;
}

export type KeyRowEvent = { type: 'key'; key: RowKey } | { type: 'ctrl' } | { type: 'text'; text: string };

const SEQUENCES: Record<RowKey, string> = {
  esc: '\x1b',
  tab: '\t',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  enter: '\r',
};

function controlForm(char: string): string | null {
  const code = char.toUpperCase().charCodeAt(0);
  if (char === ' ') return '\x00';
  if (code >= 0x40 && code <= 0x5f) return String.fromCharCode(code & 0x1f);
  return null;
}

export function pressKeyRow(state: KeyRowState, event: KeyRowEvent): { state: KeyRowState; send: string | null } {
  if (event.type === 'ctrl') return { state: { ctrl: !state.ctrl }, send: null };
  const off = { ctrl: false };
  if (event.type === 'key') return { state: off, send: SEQUENCES[event.key] };
  if (!state.ctrl || event.text.length === 0) return { state, send: event.text };
  const [first, ...rest] = event.text;
  return { state: off, send: (controlForm(first) ?? first) + rest.join('') };
}
