/**
 * @file packages/db/src/schema/index.ts
 *
 * Barrel for the Drizzle schema. Imported as `* as schema` when building
 * the typed Drizzle handle.
 */

export {
  auditLog,
  customExercises,
  planDays,
  plans,
  personalRecords,
  programs,
  sessions,
  setLogs,
  settings,
  users,
  verificationTokens,
  weekAssignments,
} from './tables.ts';
