/**
 * @file packages/tracker/test/helpers/db.ts
 *
 * Per-test PGlite + Drizzle harness for tracker orchestration tests,
 * built from the db package's exported schema + migrations.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { applyMigrations, MIGRATIONS, schema } from '@grindform/db';
import type { Db } from '@grindform/db';

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
