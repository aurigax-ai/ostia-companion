import { describe, expect, it } from 'vitest';
import { applyArtifactChange, formatAge, isArtifactUnread, markArtifactRead, sortArtifacts } from './artifacts';

const file = (name: string, mtime: number) => ({ name, kind: 'file' as const, size: 1, mtime });

describe('artifacts', () => {
  it('ART-C1 lists newest first and leaves the pad to its pinned row', () => {
    const entries = [file('old.md', 10), file('PAD.md', 99), { name: 'page', kind: 'dir' as const, size: 0, mtime: 20 }, file('new.csv', 30)];
    expect(sortArtifacts(entries, true).map((entry) => entry.name)).toEqual(['new.csv', 'page', 'old.md']);
  });

  it('ART-C2 lists only files one level down, and never a link', () => {
    const entries = [file('index.html', 10), { name: 'deep', kind: 'dir' as const, size: 0, mtime: 20 }, { name: 'out', kind: 'link' as const, size: 0, mtime: 30 }];
    expect(sortArtifacts(entries, false).map((entry) => entry.name)).toEqual(['index.html']);
    expect(sortArtifacts(entries, true).map((entry) => entry.name)).toEqual(['deep', 'index.html']);
  });

  it('ART-C3 shows at most 200 artifacts', () => {
    const entries = Array.from({ length: 250 }, (_, index) => file(`f${index}.md`, index));
    const listed = sortArtifacts(entries, true);
    expect(listed).toHaveLength(200);
    expect(listed[0].name).toBe('f249.md');
  });

  it('ART-C4 marks an added or changed file unread once, and a removed one not at all', () => {
    let unread = applyArtifactChange({}, { sessionId: 's', path: 'a.md', change: 'added' });
    unread = applyArtifactChange(unread, { sessionId: 's', path: 'a.md', change: 'changed' });
    unread = applyArtifactChange(unread, { sessionId: 's', path: 'page/index.html', change: 'changed' });
    expect(unread).toEqual({ s: ['a.md', 'page/index.html'] });
    expect(applyArtifactChange(unread, { sessionId: 's', path: 'a.md', change: 'removed' })).toEqual({ s: ['page/index.html'] });
  });

  it('ART-C5 clears the mark when the file is opened, in its own workspace only', () => {
    const unread = { s: ['a.md'], other: ['a.md'] };
    expect(markArtifactRead(unread, 's', 'a.md')).toEqual({ s: [], other: ['a.md'] });
    expect(markArtifactRead(unread, 's', 'b.md')).toBe(unread);
  });

  it('ART-C6 marks a folder unread while a file inside it is', () => {
    expect(isArtifactUnread(['page/index.html'], 'page', 'dir')).toBe(true);
    expect(isArtifactUnread(['page/index.html'], 'pages', 'dir')).toBe(false);
    expect(isArtifactUnread(['page/index.html'], 'page/index.html', 'file')).toBe(true);
    expect(isArtifactUnread(undefined, 'a.md', 'file')).toBe(false);
  });

  it('ART-C7 says how long ago a file changed', () => {
    const now = 10 * 24 * 3_600_000;
    expect(formatAge(now - 20_000, now)).toBe('just now');
    expect(formatAge(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatAge(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(formatAge(now - 2 * 24 * 3_600_000, now)).toBe('2 d ago');
  });
});
