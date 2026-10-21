import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const plugin = createRequire(import.meta.url)('./withPushStrings.js');

describe('the iOS push string', () => {
  it('PSH-I1 writes the DESKTOP_NEEDS_YOU key with its text into the app project', () => {
    const root = mkdtempSync(join(tmpdir(), 'ostia-ios-'));
    const file = plugin.writeStrings(root, 'Ostia');
    expect(file).toBe(join(root, 'Ostia', 'Localizable.strings'));
    expect(readFileSync(file, 'utf8')).toBe('"DESKTOP_NEEDS_YOU" = "A desktop needs you";\n');
  });
});
