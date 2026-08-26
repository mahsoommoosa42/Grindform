/**
 * @file packages/db/src/bootstrap.ts
 *
 * The canonical, ordered list of migrations — read from the package's
 * `migrations/` directory at load time. The server applies these on
 * boot; test harnesses apply them per fresh database.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Migration } from './migrate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

/** Every migration, in apply order. */
export const MIGRATIONS: readonly Migration[] = [
  { name: '0000_initial', sqlText: readFileSync(join(migrationsDir, '0000_initial.sql'), 'utf8') },
  { name: '0001_auth', sqlText: readFileSync(join(migrationsDir, '0001_auth.sql'), 'utf8') },
  {
    name: '0002_session_idle',
    sqlText: readFileSync(join(migrationsDir, '0002_session_idle.sql'), 'utf8'),
  },
  {
    name: '0003_email_verification',
    sqlText: readFileSync(join(migrationsDir, '0003_email_verification.sql'), 'utf8'),
  },
  {
    name: '0004_custom_exercises',
    sqlText: readFileSync(join(migrationsDir, '0004_custom_exercises.sql'), 'utf8'),
  },
  {
    name: '0005_week_calendar',
    sqlText: readFileSync(join(migrationsDir, '0005_week_calendar.sql'), 'utf8'),
  },
  {
    name: '0006_programs',
    sqlText: readFileSync(join(migrationsDir, '0006_programs.sql'), 'utf8'),
  },
  {
    name: '0007_refresh_catalog_muscles',
    sqlText: readFileSync(join(migrationsDir, '0007_refresh_catalog_muscles.sql'), 'utf8'),
  },
  {
    name: '0008_personal_records',
    sqlText: readFileSync(join(migrationsDir, '0008_personal_records.sql'), 'utf8'),
  },
];
