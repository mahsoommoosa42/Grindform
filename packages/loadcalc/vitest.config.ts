/**
 * @file packages/loadcalc/vitest.config.ts
 *
 * Vitest config for `@grindform/loadcalc`. Pure 1RM-estimation and
 * load-prescription math, unit-tested directly at 100% coverage.
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
