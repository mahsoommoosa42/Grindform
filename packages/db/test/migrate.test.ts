import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations, splitStatements } from '../src/migrate.ts';
import type { Db } from '../src/client.ts';
import { freshDb } from './helpers/db.ts';

describe('splitStatements', () => {
  it('splits on top-level semicolons and trims', () => {
    expect(splitStatements('SELECT 1; SELECT 2 ;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('ignores semicolons inside string literals', () => {
    expect(splitStatements("INSERT INTO t VALUES ('a;b'); SELECT 1")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
      'SELECT 1',
    ]);
  });

  it('keeps a trailing statement with no terminating semicolon', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1']);
  });

  it('drops empty fragments', () => {
    expect(splitStatements('  ;; ')).toEqual([]);
  });
});

describe('applyMigrations', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('is idempotent — re-applying the same migration is a no-op', async () => {
    const applied = await applyMigrations(db, [
      { name: '0000_initial', sqlText: 'SELECT 1' },
    ]);
    expect(applied).toEqual([]);
  });

  it('applies a brand-new migration and records it', async () => {
    const first = await applyMigrations(db, [
      { name: '9999_extra', sqlText: 'CREATE TABLE extra (id text PRIMARY KEY)' },
    ]);
    expect(first).toEqual(['9999_extra']);
    const second = await applyMigrations(db, [
      { name: '9999_extra', sqlText: 'CREATE TABLE extra (id text PRIMARY KEY)' },
    ]);
    expect(second).toEqual([]);
  });
});
