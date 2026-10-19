export interface ListPrefs {
  unfolded: string[];
  recent: string[];
  lastChat: string | null;
}

export const DEFAULT_LIST_PREFS: ListPrefs = { unfolded: [], recent: [], lastChat: null };

const MAX_RECENT = 5;

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

export function parseListPrefs(raw: string | null): ListPrefs {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      unfolded: strings(value?.unfolded),
      recent: strings(value?.recent).slice(0, MAX_RECENT),
      lastChat: typeof value?.lastChat === 'string' ? value.lastChat : null,
    };
  } catch {
    return DEFAULT_LIST_PREFS;
  }
}

export function toggleFold(prefs: ListPrefs, key: string): ListPrefs {
  const unfolded = prefs.unfolded.includes(key) ? prefs.unfolded.filter((item) => item !== key) : [...prefs.unfolded, key];
  return { ...prefs, unfolded };
}

export function rememberSearch(prefs: ListPrefs, query: string): ListPrefs {
  const text = query.trim();
  if (!text) return prefs;
  return { ...prefs, recent: [text, ...prefs.recent.filter((item) => item !== text)].slice(0, MAX_RECENT) };
}
