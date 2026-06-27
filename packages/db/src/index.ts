/**
 * @file packages/db/src/index.ts
 *
 * Public barrel for `@grindform/db` — schema, client types, the
 * migration runner, and the repos.
 */

export * as schema from './schema/index.ts';
export { planDays, plans, setLogs, settings } from './schema/tables.ts';
export type { Db, DbOrTx, DbTx } from './client.ts';
export { applyMigrations, splitStatements } from './migrate.ts';
export type { Migration } from './migrate.ts';
export { MIGRATIONS } from './bootstrap.ts';

export { createPlan, deletePlan, getPlan, listPlanSummaries } from './repos/plans-repo.ts';
export type { PlanSummary } from './repos/plans-repo.ts';
export { deleteLog, listLogsForDay, listLogsForExercise, logSet } from './repos/logs-repo.ts';
export type { NewSetLog, SetLog } from './repos/logs-repo.ts';
export { getSettings, upsertSettings } from './repos/settings-repo.ts';
export type { Settings, SettingsPatch } from './repos/settings-repo.ts';
