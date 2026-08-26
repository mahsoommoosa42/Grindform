import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';

import { MIGRATIONS } from '../src/bootstrap.ts';
import { applyMigrations, splitStatements } from '../src/migrate.ts';
import type { Db } from '../src/client.ts';
import * as schema from '../src/schema/index.ts';
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
    const applied = await applyMigrations(db, [{ name: '0000_initial', sqlText: 'SELECT 1' }]);
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

  it('refreshes known catalog muscles without changing unknown slots', async () => {
    const client = new PGlite();
    const isolatedDb = drizzle(client, { schema });
    const sessions = [
      {
        kind: 'training',
        id: 'session',
        focus: ['back'],
        blocks: [
          {
            type: 'main',
            title: 'Main',
            estMinutes: 10,
            slots: [
              {
                id: 'known',
                exerciseSlug: 'conventional-deadlift',
                name: 'Deadlift',
                scheme: { sets: 1, repsLow: 1, repsHigh: 1, restSeconds: 1, perSide: false },
                primaryMuscles: ['back', 'glutes'],
              },
              {
                id: 'unknown',
                exerciseSlug: 'custom-unknown',
                name: 'Custom',
                scheme: { sets: 1, repsLow: 1, repsHigh: 1, restSeconds: 1, perSide: false },
                primaryMuscles: ['shoulders'],
              },
            ],
          },
        ],
      },
    ];
    try {
      await applyMigrations(isolatedDb, MIGRATIONS.slice(0, 7));
      await isolatedDb.execute(sql`
        INSERT INTO plans (id, user_id, goal, experience, variation, time_budget)
        VALUES (
          ${'plan'},
          ${'user'},
          ${'recomp'},
          ${'beginner'},
          ${'A'},
          ${JSON.stringify({
            sessionMinutes: 30,
            warmupMinutes: 5,
            cooldownMinutes: 5,
            physioMinutes: 0,
            physioPosition: 0,
          })}::jsonb
        )
      `);
      await isolatedDb.execute(sql`
        INSERT INTO plan_days (id, plan_id, position, weekday, sessions, est_minutes)
        VALUES (${'day'}, ${'plan'}, ${0}, ${'mon'}, ${JSON.stringify(sessions)}::jsonb, ${10})
      `);
      await applyMigrations(isolatedDb, [MIGRATIONS[7]!]);
      const result = await isolatedDb.execute<{ sessions: typeof sessions }>(
        sql`SELECT sessions FROM plan_days WHERE id = ${'day'}`,
      );
      const slots = result.rows[0]?.sessions[0]?.blocks[0]?.slots;
      expect(slots?.[0]?.primaryMuscles).toEqual(['hamstrings']);
      expect(slots?.[1]?.primaryMuscles).toEqual(['shoulders']);
    } finally {
      await client.close();
    }
  });
});
