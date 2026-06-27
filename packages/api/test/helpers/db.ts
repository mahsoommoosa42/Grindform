/**
 * @file packages/api/test/helpers/db.ts
 *
 * Per-test PGlite + Drizzle harness plus an app builder, so each
 * integration test runs against an isolated, migrated database.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Hono } from 'hono';

import { applyMigrations, MIGRATIONS, schema } from '@grindform/db';
import type { Db } from '@grindform/db';

import { createApp } from '../../src/app.ts';

/** Spin up a fresh, migrated db plus a wired Hono app. */
export const freshApp = async (): Promise<{
  app: Hono;
  db: Db;
  dispose: () => Promise<void>;
}> => {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await applyMigrations(db, [...MIGRATIONS]);
  return {
    app: createApp({ db }),
    db,
    dispose: async () => {
      await client.close();
    },
  };
};
