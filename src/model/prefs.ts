import { watchFontSize } from './terminalFit';

export interface TerminalPrefs {
  fontSize: number;
  fitWhenWatching: boolean;
  keyRow: boolean;
  haptics: boolean;
}

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 18;
export const DEFAULT_PREFS: TerminalPrefs = { fontSize: 13, fitWhenWatching: true, keyRow: true, haptics: true };

export function parsePrefs(text: string | null): TerminalPrefs {
  let stored: Record<string, unknown> = {};
  try {
    const value = text ? JSON.parse(text) : {};
    if (value && typeof value === 'object') stored = value;
  } catch {
    return DEFAULT_PREFS;
  }
  const flag = (key: keyof TerminalPrefs) =>
    typeof stored[key] === 'boolean' ? (stored[key] as boolean) : (DEFAULT_PREFS[key] as boolean);
  const size = typeof stored.fontSize === 'number' && Number.isFinite(stored.fontSize) ? stored.fontSize : DEFAULT_PREFS.fontSize;
  return {
    fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size))),
    fitWhenWatching: flag('fitWhenWatching'),
    keyRow: flag('keyRow'),
    haptics: flag('haptics'),
  };
}

export function terminalFontSize(
  role: 'owner' | 'observer',
  prefs: TerminalPrefs,
  measured: { cols: number; fontSize: number },
  desktopCols: number,
): number {
  if (role === 'owner' || !prefs.fitWhenWatching) return prefs.fontSize;
  return Math.min(prefs.fontSize, watchFontSize(measured, desktopCols));
}
