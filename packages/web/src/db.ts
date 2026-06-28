/**
 * @file packages/web/src/db.ts
 *
 * Composition root for the server's database handle. Uses PGlite — an
 * embedded Postgres — so Grindform deploys as a single process with no
 * external database to provision. Set `GRINDFORM_DATA_DIR` to a writable
 * path to persist data across restarts; leave it unset (or `memory`) for
 * an ephemeral in-memory database (used by the E2E suite).
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import { applyMigrations, MIGRATIONS, schema } from '@grindform/db';
import type { Db } from '@grindform/db';

/** Build and migrate the server database. */
export const createServerDb = async (): Promise<{ db: Db; close: () => Promise<void> }> => {
  const dataDir = process.env.GRINDFORM_DATA_DIR;
  const client =
    dataDir !== undefined && dataDir !== '' && dataDir !== 'memory'
      ? new PGlite(dataDir)
      : new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await applyMigrations(db, [...MIGRATIONS]);
  return {
    db,
    close: async () => {
      await client.close();
    },
  };
};
