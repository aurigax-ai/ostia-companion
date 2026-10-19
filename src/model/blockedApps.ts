const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
export const MAX_BLOCKED = 500;

export function parseBlocked(text: string | null): string[] {
  try {
    const value = JSON.parse(text ?? '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && PACKAGE.test(item)))].slice(0, MAX_BLOCKED);
  } catch {
    return [];
  }
}

export function toggleBlocked(list: string[], packageName: string, blocked: boolean): string[] {
  const rest = list.filter((item) => item !== packageName);
  return blocked && PACKAGE.test(packageName) ? [...rest, packageName].slice(0, MAX_BLOCKED) : rest;
}

export function blockedSummary(count: number): string {
  const base = 'Password managers, authenticators, payments';
  return count === 0 ? base : `${base} and ${count} more`;
}
