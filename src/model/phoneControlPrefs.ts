import { DEFAULT_LIMIT, SESSION_LIMITS, SessionLimit } from './phoneSession';

export type AllowMode = 'ask' | 'chosen' | 'off';
export type Level = 'view' | 'control';

export interface PhoneControlPrefs {
  mode: AllowMode;
  chosen: string[];
  level: Level;
  limit: SessionLimit;
  fingerprint: boolean;
}

export const DEFAULT_PHONE_CONTROL: PhoneControlPrefs = { mode: 'ask', chosen: [], level: 'control', limit: DEFAULT_LIMIT, fingerprint: true };

export function parsePhoneControl(value: unknown): PhoneControlPrefs {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    mode: raw.mode === 'chosen' || raw.mode === 'off' ? raw.mode : 'ask',
    chosen: Array.isArray(raw.chosen) ? raw.chosen.filter((id): id is string => typeof id === 'string') : [],
    level: raw.level === 'view' ? 'view' : 'control',
    limit: SESSION_LIMITS.includes(raw.limit as SessionLimit) ? (raw.limit as SessionLimit) : DEFAULT_LIMIT,
    fingerprint: raw.fingerprint !== false,
  };
}

export function parsePhoneControlByDesktop(raw: string | null): Record<string, PhoneControlPrefs> {
  try {
    const value = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([desktop, prefs]) => [desktop, parsePhoneControl(prefs)]));
  } catch {
    return {};
  }
}

export type RequestDecision = 'ask' | 'allow' | 'off' | 'unsupported';

export function decideRequest(prefs: PhoneControlPrefs, sessionId: string, supported: boolean): RequestDecision {
  if (!supported) return 'unsupported';
  if (prefs.mode === 'off') return 'off';
  if (prefs.mode === 'chosen' && prefs.chosen.includes(sessionId)) return 'allow';
  return 'ask';
}

export function toggleChosen(prefs: PhoneControlPrefs, sessionId: string): PhoneControlPrefs {
  const chosen = prefs.chosen.includes(sessionId) ? prefs.chosen.filter((id) => id !== sessionId) : [...prefs.chosen, sessionId];
  return { ...prefs, chosen };
}
