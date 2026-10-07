export interface FileEntry {
  name: string;
  kind: 'file' | 'dir' | 'link';
  size: number;
  mtime: number;
}

export interface FileContent {
  text?: string;
  base64?: string;
  size: number;
  truncated: boolean;
}

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name));
}

export function numberedLines(text: string): { number: number; text: string }[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line, index) => ({ number: index + 1, text: line }));
}

export function previewKind(name: string, content: FileContent): 'text' | 'image' | 'none' {
  if (content.text !== undefined) return 'text';
  return IMAGE.test(name) ? 'image' : 'none';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
