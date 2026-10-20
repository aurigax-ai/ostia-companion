import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'websocket-pinning': fileURLToPath(new URL('./modules/websocket-pinning/index.ts', import.meta.url)) } },
  test: { exclude: [...configDefaults.exclude, '**/*.render.test.tsx', 'src/testing/jestSetup.ts', '.claude/**'] },
});
