/**
 * @file packages/api/vitest.config.ts
 *
 * Vitest config for `@grindform/api`. Routes are exercised end-to-end via
 * `app.request(...)` against a real PGlite-backed db. 100% coverage on
 * every metric — the HTTP contract is the seam the UI depends on.
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
