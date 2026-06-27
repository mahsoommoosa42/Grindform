/**
 * @file packages/db/src/client.ts
 *
 * Database handle types. The concrete driver (PGlite) is created by the
 * composition root (the server / test harness) and passed to repos as an
 * opaque `Db`, so repo code never knows or cares which driver it ran on.
 */

import type { PgliteDatabase } from 'drizzle-orm/pglite';

import type * as schema from './schema/index.ts';

/** A fully-typed Drizzle handle bound to the Grindform schema. */
export type Db = PgliteDatabase<typeof schema>;

/** The transaction handle passed to a `db.transaction(async (tx) => …)` callback. */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Anything a repo can run against: a connection or an open transaction. */
export type DbOrTx = Db | DbTx;
