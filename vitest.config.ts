import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '**/*.render.test.tsx', 'src/testing/jestSetup.ts', '.claude/**'] },
});
