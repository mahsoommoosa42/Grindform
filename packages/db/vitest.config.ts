/**
 * @file packages/db/vitest.config.ts
 *
 * Vitest config for `@grindform/db`. Repos are exercised against a real
 * in-memory PGlite instance (see test/helpers/db.ts) and held at 100%
 * coverage — the SQL contract is only as trustworthy as its tests.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      // Declarative-only modules (Drizzle table defs, pure type aliases)
      // carry no runtime logic to test.
      exclude: ['src/index.ts', 'src/schema/**', 'src/client.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
