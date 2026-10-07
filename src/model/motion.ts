import type { TerminalPrefs } from './prefs';

export type HapticEvent = 'tap' | 'approved' | 'failed';
export type HapticKind = 'selection' | 'success' | 'warning';

const LIST_MS = 200;
const PILL_MS = 150;
const EASE = { type: 'easeInEaseOut', property: 'opacity' } as const;

export function listAnimation(reduceMotion: boolean) {
  if (reduceMotion) return null;
  return { duration: LIST_MS, create: EASE, update: { type: 'easeInEaseOut' } as const, delete: EASE };
}

export function pillFadeMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : PILL_MS;
}

const HAPTICS: Record<HapticEvent, HapticKind> = { tap: 'selection', approved: 'success', failed: 'warning' };

export function hapticFor(event: HapticEvent, prefs: TerminalPrefs): HapticKind | null {
  return prefs.haptics ? HAPTICS[event] : null;
}
