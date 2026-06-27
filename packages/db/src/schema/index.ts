/**
 * @file packages/db/src/schema/index.ts
 *
 * Barrel for the Drizzle schema. Imported as `* as schema` when building
 * the typed Drizzle handle.
 */

export { planDays, plans, setLogs, settings } from './tables.ts';
