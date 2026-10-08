import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(dirname(createRequire(import.meta.url).resolve('mermaid/package.json')), 'dist/mermaid.min.js'), 'utf8');
mkdirSync(join(root, 'src/generated'), { recursive: true });
writeFileSync(join(root, 'src/generated/mermaidSource.ts'), `export const MERMAID_SOURCE: string = ${JSON.stringify(source)};\n`);
