/**
 * @file packages/db/src/migrate.ts
 *
 * A tiny, dependency-light migration runner. Each migration is a name +
 * raw SQL text; statements are split on semicolons (respecting string
 * literals) and applied inside one transaction per migration, recorded
 * in a bookkeeping table so re-runs are no-ops.
 */

import { sql } from 'drizzle-orm';

import type { Db, DbOrTx } from './client.ts';

/** Bookkeeping table tracking which migrations have run. */
const MIGRATIONS_TABLE = '__grindform_migrations';

/** A single migration: a unique name and its raw SQL body. */
export interface Migration {
  readonly name: string;
  readonly sqlText: string;
}

/**
 * Split a multi-statement SQL string into individual statements,
 * ignoring semicolons that fall inside single-quoted string literals.
 * Trailing whitespace-only fragments are dropped.
 */
export const splitStatements = (sqlText: string): string[] => {
  const out: string[] = [];
  let buf = '';
  let inString = false;
  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    if (ch === "'") {
      inString = !inString;
      buf += ch;
      continue;
    }
    if (ch === ';' && !inString) {
      const trimmed = buf.trim();
      if (trimmed.length > 0) out.push(trimmed);
      buf = '';
      continue;
    }
    buf += ch;
  }
  const trailing = buf.trim();
  if (trailing.length > 0) out.push(trailing);
  return out;
};

/** Create the bookkeeping table if it doesn't exist yet. */
const ensureBookkeeping = async (db: DbOrTx): Promise<void> => {
  await db.execute(
    sql.raw(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} ` +
        `(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
    ),
  );
};

/** Return the set of migration names already applied. */
const listApplied = async (db: DbOrTx): Promise<Set<string>> => {
  const result = (await db.execute(sql.raw(`SELECT name FROM ${MIGRATIONS_TABLE}`))) as unknown as {
    rows: ReadonlyArray<{ name: string }>;
  };
  return new Set(result.rows.map((r) => r.name));
};

/**
 * Apply every migration not yet recorded, in order, each inside its own
 * transaction. Idempotent: a second call with the same set is a no-op.
 * Returns the names actually applied during this call.
 */
export const applyMigrations = async (
  db: Db,
  migrations: ReadonlyArray<Migration>,
): Promise<ReadonlyArray<string>> => {
  await ensureBookkeeping(db);
  const already = await listApplied(db);
  const applied: string[] = [];
  for (const m of migrations) {
    if (already.has(m.name)) continue;
    const statements = splitStatements(m.sqlText);
    await db.transaction(async (tx) => {
      for (const stmt of statements) {
        await tx.execute(sql.raw(stmt));
      }
      await tx.execute(sql`INSERT INTO ${sql.raw(MIGRATIONS_TABLE)} (name) VALUES (${m.name})`);
    });
    applied.push(m.name);
  }
  return applied;
};
