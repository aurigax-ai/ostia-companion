import { describe, expect, it } from 'vitest';
import { numberedLines, previewKind, sortEntries } from './files';

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
});
