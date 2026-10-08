import { FileEntry } from './files';

export const PAD_FILE = 'PAD.md';
export const PAD_TITLE = 'Scratch Pad';
export const PAD_EMPTY = 'A working note for this workspace, shared with its agents. It goes away with the workspace; move what you want to keep into the project or your notes.';
export const ARTIFACT_LIST_LIMIT = 200;

export type ArtifactChange = { sessionId: string; path: string; change: 'added' | 'changed' | 'removed' };
export type Unread = Record<string, string[]>;

export function sortArtifacts(entries: FileEntry[], atRoot: boolean): FileEntry[] {
  return entries
    .filter((entry) => entry.kind === 'file' || (atRoot && entry.kind === 'dir'))
    .filter((entry) => !(atRoot && entry.name === PAD_FILE))
    .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))
    .slice(0, ARTIFACT_LIST_LIMIT);
}

export function applyArtifactChange(unread: Unread, { sessionId, path, change }: ArtifactChange): Unread {
  const rest = (unread[sessionId] ?? []).filter((other) => other !== path);
  return { ...unread, [sessionId]: change === 'removed' ? rest : [...rest, path] };
}

export function markArtifactRead(unread: Unread, sessionId: string, path: string): Unread {
  if (!unread[sessionId]?.includes(path)) return unread;
  return { ...unread, [sessionId]: unread[sessionId].filter((other) => other !== path) };
}

export function isArtifactUnread(paths: string[] | undefined, path: string, kind: FileEntry['kind']): boolean {
  if (!paths) return false;
  return kind === 'dir' ? paths.some((other) => other.startsWith(`${path}/`)) : paths.includes(path);
}

export function formatAge(mtime: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - mtime) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
