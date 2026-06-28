/**
 * @file packages/catalog/vitest.config.ts
 *
 * Vitest config for `@grindform/catalog`. 100% coverage on the query
 * logic and the catalog data (a malformed library entry should fail a
 * test, not surface at runtime).
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
