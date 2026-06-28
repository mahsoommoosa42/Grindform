/**
 * @file packages/core/vitest.config.ts
 *
 * Vitest config for `@grindform/core`. Coverage is scoped to this
 * package's own sources and held at 100% on every metric — core is the
 * foundation every other package imports, so an uncovered branch here
 * is an unverified contract everywhere downstream.
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
