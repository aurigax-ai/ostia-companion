import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

describe('no resize', () => {
  it('CRD-C45 nothing in the app sends the resize frame 0x03', () => {
    const files = sources(join(__dirname, '..'));
    const offenders = files.filter((file) => /sendResize|fromCharCode\(0x03\)|\\x03/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
