/**
 * @file packages/db/test/helpers/db.ts
 *
 * Per-test PGlite + Drizzle harness. Each `freshDb()` spins up a brand
 * new in-memory database with the canonical migration applied and hands
 * back an opaque {@link Db} plus a `dispose()` to release the WASM module.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { MIGRATIONS } from '../../src/bootstrap.ts';
import type { Db } from '../../src/client.ts';
import { applyMigrations } from '../../src/migrate.ts';
import * as schema from '../../src/schema/index.ts';

/** Spin up a fresh, migrated, in-memory database. */
export const freshDb = async (): Promise<{ db: Db; dispose: () => Promise<void> }> => {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await applyMigrations(db, [...MIGRATIONS]);
  return {
    db,
    dispose: async () => {
      await client.close();
    },
  };
};
