export interface FileEntry {
  name: string;
  kind: 'file' | 'dir' | 'link';
  size: number;
  mtime: number;
}

export type FileRoot = 'workspace' | 'artifacts';

export interface FileTarget {
  sessionId: string;
  path: string;
  root: FileRoot;
}

export interface FileContent {
  text?: string;
  base64?: string;
  size: number;
  truncated: boolean;
}

export interface WholeFile {
  text?: string;
  base64?: string;
  size: number;
  complete: boolean;
}

export type ViewerKind = 'markdown' | 'image' | 'svg' | 'mermaid' | 'table' | 'pdf' | 'runnable' | 'text';

export const WHOLE_TEXT_LIMIT = 2 * 1024 * 1024;
export const WHOLE_BYTES_LIMIT = 16 * 1024 * 1024;

const KINDS: [RegExp, ViewerKind][] = [
  [/\.(md|markdown)$/i, 'markdown'],
  [/\.(png|jpe?g|gif|webp)$/i, 'image'],
  [/\.svg$/i, 'svg'],
  [/\.(mmd|mermaid)$/i, 'mermaid'],
  [/\.(csv|tsv)$/i, 'table'],
  [/\.pdf$/i, 'pdf'],
  [/\.(html?|jsx|tsx)$/i, 'runnable'],
];

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };

export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name));
}

export function numberedLines(text: string): { number: number; text: string }[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line, index) => ({ number: index + 1, text: line }));
}

export function viewerKind(name: string): ViewerKind {
  return KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? 'text';
}

export function previewKind(name: string, content: Partial<FileContent>): ViewerKind | 'none' {
  const kind = viewerKind(name);
  if (kind === 'image' || kind === 'pdf') return kind;
  return content.text === undefined ? 'none' : kind;
}

export function mimeType(name: string): string {
  return MIME[name.slice(name.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
}

export function utf8Bytes(text: string): string {
  return unescape(encodeURIComponent(text));
}

export function sliceBytes(piece: FileContent): string {
  return piece.base64 !== undefined ? atob(piece.base64) : utf8Bytes(piece.text ?? '');
}

export function decodeUtf8(bytes: string): { text: string; rest: string } | null {
  let cut = bytes.length;
  for (let back = 1; back <= Math.min(3, bytes.length); back++) {
    const byte = bytes.charCodeAt(bytes.length - back);
    if (byte < 0x80) break;
    if (byte >= 0xc0) {
      if ((byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2) > back) cut = bytes.length - back;
      break;
    }
  }
  try {
    return { text: decodeURIComponent(escape(bytes.slice(0, cut))), rest: bytes.slice(cut) };
  } catch {
    return null;
  }
}

export async function readWhole(read: (offset: number) => Promise<FileContent>, mode: 'text' | 'bytes', limit: number): Promise<WholeFile> {
  for (let attempt = 0; ; attempt++) {
    let head = '';
    const tail: string[] = [];
    let offset = 0;
    let size: number | null = null;
    for (;;) {
      const piece = await read(offset);
      if (size !== null && piece.size !== size) break;
      size = piece.size;
      const first = offset === 0;
      if (first && mode === 'text' && piece.text === undefined) return { size, complete: false };
      if (first && mode === 'bytes' && size > limit) return { size, complete: false };
      const legacy = !first && piece.base64 === undefined;
      const bytes = legacy ? '' : sliceBytes(piece);
      if (first && mode === 'text') head = piece.text!;
      else tail.push(bytes);
      offset += bytes.length;
      const complete = !legacy && !piece.truncated;
      if (complete || bytes.length === 0 || offset >= limit) {
        if (mode === 'bytes') return { base64: btoa(tail.join('')), size, complete };
        const decoded = decodeUtf8(tail.join(''));
        return decoded ? { text: head + decoded.text, size, complete } : { size, complete: false };
      }
    }
    if (attempt === 1) throw { code: -1, message: 'The file kept changing while it was read' };
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
