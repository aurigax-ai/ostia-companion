export interface AlertPrefs {
  waiting: boolean;
  done: boolean;
  failed: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { waiting: true, done: true, failed: true };

export function parseAlertPrefs(text: string | null): AlertPrefs {
  let stored: Record<string, unknown> = {};
  try {
    const value = text ? JSON.parse(text) : {};
    if (value && typeof value === 'object') stored = value;
  } catch {
    return DEFAULT_ALERT_PREFS;
  }
  const flag = (key: keyof AlertPrefs) => (typeof stored[key] === 'boolean' ? (stored[key] as boolean) : DEFAULT_ALERT_PREFS[key]);
  return { waiting: flag('waiting'), done: flag('done'), failed: flag('failed') };
}
