export const LOG_LIMIT = 200;

export interface LogEntry {
  at: number;
  text: string;
}

export function addEntry(log: LogEntry[], text: string, at: number, secrets: string[]): LogEntry[] {
  const clean = secrets.filter(Boolean).reduce((line, secret) => line.split(secret).join('[token]'), text);
  return [...log, { at, text: clean }].slice(-LOG_LIMIT);
}

export function formatLog(log: LogEntry[]): string {
  return log.map((entry) => `${new Date(entry.at).toISOString()} ${entry.text}`).join('\n');
}
