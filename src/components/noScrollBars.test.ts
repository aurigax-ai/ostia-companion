import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCROLLING = /(?<![\w$])<(ScrollView|FlatList|SectionList|FlashList|WebView)\b([^>]*)/g;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.tsx') && !name.includes('.test.') ? [path] : [];
  });
}

describe('scroll bars', () => {
  it('PHA-C29 no list, scroll view or web view in the app draws a scroll bar', () => {
    const files = sources(join(__dirname, '..'));
    const views = files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(SCROLLING)].map((match) => ({ file, tag: match[1], props: match[2] })));
    expect(views.length).toBeGreaterThan(15);
    expect(views.filter((view) => !view.props.includes('{...NO_SCROLL_BARS}')).map((view) => `${view.file}: ${view.tag}`)).toEqual([]);
  });

  it('PHA-C29 the terminal draws no scroll indicator on Android or iOS', () => {
    const ghostty = dirname(createRequire(__filename).resolve('expo-libghostty/package.json'));
    const android = readFileSync(join(ghostty, 'android/src/main/java/expo/modules/libghostty/GhosttyTerminalView.kt'), 'utf8');
    expect(android).not.toMatch(/drawScrollIndicator\(/);
    const swift = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return swift(path);
        return name.endsWith('.swift') ? [readFileSync(path, 'utf8')] : [];
      });
    const ios = swift(join(ghostty, 'ios'));
    expect(ios.length).toBeGreaterThan(0);
    expect(ios.filter((source) => /shows(Vertical|Horizontal)ScrollIndicator\s*=\s*true/.test(source))).toEqual([]);
  });
});
