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
];
