/**
 * @file packages/db/src/index.ts
 *
 * Public barrel for `@grindform/db` — schema, client types, the
 * migration runner, and the repos.
 */

export * as schema from './schema/index.ts';
export { auditLog, planDays, plans, sessions, setLogs, settings, users } from './schema/tables.ts';
export type { Db, DbOrTx, DbTx } from './client.ts';
export { applyMigrations, splitStatements } from './migrate.ts';
export type { Migration } from './migrate.ts';
export { MIGRATIONS } from './bootstrap.ts';

export {
  createPlan,
  dayBelongsToUser,
  deletePlan,
  getDayForUser,
  getPlan,
  listPlanIdsForUser,
  listPlanSummaries,
  planBelongsToUser,
} from './repos/plans-repo.ts';
export type { PlanSummary } from './repos/plans-repo.ts';
export { deleteLog, listLogsForDay, listLogsForExercise, logSet } from './repos/logs-repo.ts';
export type { NewSetLog, SetLog } from './repos/logs-repo.ts';
export { getSettings, upsertSettings } from './repos/settings-repo.ts';
export type { Settings, SettingsPatch } from './repos/settings-repo.ts';
export {
  countAdmins,
  createUser,
  deleteUserAndData,
  findUserByEmail,
  findUserById,
  lastActivityFor,
  listUsersWithStats,
  setUserRole,
  setUserStatus,
  touchLastLogin,
  updateUserPassword,
} from './repos/users-repo.ts';
export type { NewUser, User, UserWithStats } from './repos/users-repo.ts';
export {
  createSession,
  findSessionByTokenHash,
  revokeAllSessionsForUser,
  revokeSession,
  touchSession,
} from './repos/sessions-repo.ts';
export type { NewSession, Session } from './repos/sessions-repo.ts';
export { listAuditForUser, recordAudit } from './repos/audit-repo.ts';
export type { AuditEntry, NewAuditEntry } from './repos/audit-repo.ts';
