import { describe, expect, it } from 'vitest';
import { FileContent, decodeUtf8, numberedLines, previewKind, readWhole, utf8Bytes, viewerKind } from './files';
import { sortEntries } from './files';

describe('files', () => {
  it('FIL-C5 puts folders first, then files by name, dotfiles included', () => {
    const entries = [
      { name: 'b.txt', kind: 'file' as const, size: 1, mtime: 0 },
      { name: 'src', kind: 'dir' as const, size: 0, mtime: 0 },
      { name: 'a.md', kind: 'file' as const, size: 1, mtime: 0 },
      { name: '.env', kind: 'file' as const, size: 1, mtime: 0 },
    ];
    expect(sortEntries(entries).map((e) => e.name)).toEqual(['src', '.env', 'a.md', 'b.txt']);
  });

  it('FIL-C6 numbers the lines of a text file', () => {
    expect(numberedLines('one\ntwo\n')).toEqual([
      { number: 1, text: 'one' },
      { number: 2, text: 'two' },
    ]);
  });

  it('FIL-C7 cannot preview a binary file that is not an image', () => {
    expect(previewKind('app.bin', { base64: 'AAEC', size: 3, truncated: false })).toBe('none');
    expect(previewKind('logo.png', { base64: 'iVBO', size: 3, truncated: false })).toBe('image');
    expect(previewKind('a.ts', { text: 'x', size: 1, truncated: false })).toBe('text');
  });

  it('ART-C13 picks the viewer by file name', () => {
    const kinds = ['plan.md', 'shot.PNG', 'chart.svg', 'flow.mmd', 'data.csv', 'data.tsv', 'paper.pdf', 'page.html', 'App.tsx', 'App.jsx', 'main.ts', 'notes'];
    expect(kinds.map(viewerKind)).toEqual(['markdown', 'image', 'svg', 'mermaid', 'table', 'table', 'pdf', 'runnable', 'runnable', 'runnable', 'text', 'text']);
  });

  const served = (file: string, limit: number) => async (offset: number): Promise<FileContent> => {
    const bytes = utf8Bytes(file);
    const slice = bytes.slice(offset, offset + limit);
    const truncated = offset + slice.length < bytes.length;
    if (offset > 0) return { base64: btoa(slice), size: bytes.length, truncated };
    return { text: decodeUtf8(slice)!.text, size: bytes.length, truncated };
  };

  it('ART-C14 reads a large file slice by slice, advancing by the bytes returned', async () => {
    const file = 'héllo wörld € '.repeat(8);
    const offsets: number[] = [];
    const read = served(file, 33);
    const whole = await readWhole((offset) => (offsets.push(offset), read(offset)), 'text', 1000);
    expect(whole).toEqual({ text: file, size: 144, complete: true });
    expect(offsets).toEqual([0, 32, 65, 98, 131]);
  });

  it('ART-C15 stops at the limit and says the file is not complete', async () => {
    const whole = await readWhole(served('x'.repeat(100), 30), 'text', 50);
    expect(whole.complete).toBe(false);
    expect(whole.text).toHaveLength(60);
    expect(await readWhole(served('x'.repeat(100), 30), 'bytes', 50)).toEqual({ size: 100, complete: false });
  });

  it('ART-C16 joins a text slice and base64 slices into the bytes of a file', async () => {
    const pieces: Record<number, FileContent> = {
      0: { text: 'é', size: 6, truncated: true },
      2: { base64: btoa('\x89PNG'), size: 6, truncated: false },
    };
    const whole = await readWhole(async (offset) => pieces[offset], 'bytes', 1000);
    expect(atob(whole.base64!)).toBe('\xc3\xa9\x89PNG');
    expect(whole.complete).toBe(true);
  });

  it('ART-C17 takes one slice from a desktop that ignores offset and answers text again', async () => {
    const offsets: number[] = [];
    const legacy = async (offset: number): Promise<FileContent> => (offsets.push(offset), { text: 'first', size: 500, truncated: true });
    expect(await readWhole(legacy, 'text', 1000)).toEqual({ text: 'first', size: 500, complete: false });
    expect(offsets).toEqual([0, 5]);
  });

  it('ART-C18 starts again when the file changes between slices', async () => {
    let calls = 0;
    const read = async (): Promise<FileContent> => {
      calls++;
      if (calls === 1) return { text: 'old-', size: 8, truncated: true };
      if (calls === 2) return { base64: btoa('x'), size: 3, truncated: false };
      return { text: 'new', size: 3, truncated: false };
    };
    expect(await readWhole(read, 'text', 1000)).toEqual({ text: 'new', size: 3, complete: true });
  });

  it('ART-C19 does not render a text viewer for bytes that are not text', async () => {
    expect(await readWhole(async () => ({ base64: 'AAEC', size: 3, truncated: false }), 'text', 1000)).toEqual({ size: 3, complete: false });
    expect(previewKind('plan.md', { base64: 'AAEC' })).toBe('none');
  });

  it('ART-C20 decodes a slice up to the last whole character and keeps the rest for the next one', () => {
    const bytes = utf8Bytes('a€');
    expect(decodeUtf8(bytes.slice(0, 3))).toEqual({ text: 'a', rest: bytes.slice(1, 3) });
    expect(decodeUtf8(bytes)).toEqual({ text: 'a€', rest: '' });
    expect(decodeUtf8('\xff\xfeab')).toBeNull();
  });
});
