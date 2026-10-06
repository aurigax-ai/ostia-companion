import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

const read = (specifier) => readFileSync(require.resolve(specifier), 'utf8');
const inlineSafe = (text, tag) => text.replaceAll(`</${tag}`, `<\\/${tag}`);

const assets = {
  XTERM_JS: inlineSafe(read('@xterm/xterm/lib/xterm.js'), 'script'),
  XTERM_CSS: inlineSafe(read('@xterm/xterm/css/xterm.css'), 'style'),
  FIT_ADDON_JS: inlineSafe(read('@xterm/addon-fit/lib/addon-fit.js'), 'script'),
};

const body = Object.entries(assets)
  .map(([name, text]) => `export const ${name} = ${JSON.stringify(text)};`)
  .join('\n');

writeFileSync(join(root, 'src/components/terminalAssets.generated.ts'), `${body}\n`);
