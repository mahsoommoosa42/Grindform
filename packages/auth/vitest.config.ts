/**
 * @file packages/auth/vitest.config.ts
 *
 * Vitest config for `@grindform/auth`. 100% coverage on every metric —
 * password hashing, token comparison, and the session predicate are
 * security-critical seams where an untested branch is a real risk.
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
