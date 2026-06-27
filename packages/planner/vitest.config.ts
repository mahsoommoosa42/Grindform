/**
 * @file packages/planner/vitest.config.ts
 *
 * Vitest config for `@grindform/planner`. The generator is the heart of
 * the product, so every branch of selection, budgeting, and scheme
 * derivation is held to 100% coverage.
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
