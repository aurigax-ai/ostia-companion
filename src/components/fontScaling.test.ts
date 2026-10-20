import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

describe('font scaling', () => {
  it('PHA-C32 no text turns off or caps the phone font size', () => {
    const files = [...sources(join(__dirname, '..')), join(__dirname, '../../App.tsx')];
    const offenders = files.filter((file) => /allowFontScaling\s*=\s*\{?\s*false|maxFontSizeMultiplier/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
