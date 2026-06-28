/**
 * @file packages/tracker/vitest.config.ts
 *
 * Vitest config for `@grindform/tracker`. Pure progress/progression
 * logic is unit-tested directly; the thin DB orchestration is exercised
 * against PGlite. 100% coverage on every metric.
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
