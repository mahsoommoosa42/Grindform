/**
 * @file packages/db/src/repos/audit-repo.ts
 *
 * Persistence for the append-only audit trail. There is no update or
 * delete path by design — rows are written once and only ever read, so
 * the security/support history can't be quietly rewritten.
 */

import { desc, eq } from 'drizzle-orm';

import { newAuditId } from '@grindform/core';
import type { AuditAction, UserId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { auditLog } from '../schema/tables.ts';

/** An `audit_log` row as stored/returned. */
export type AuditEntry = typeof auditLog.$inferSelect;

/** Fields needed to record an audit event. `id`/`createdAt` are minted here. */
export interface NewAuditEntry {
  readonly action: AuditAction;
  readonly actorUserId: UserId | null;
  readonly targetUserId: UserId | null;
  readonly details?: Record<string, unknown>;
}

/** Append an audit entry and return it. */
export const recordAudit = async (db: DbOrTx, input: NewAuditEntry): Promise<AuditEntry> => {
  const row: AuditEntry = {
    id: newAuditId(),
    action: input.action,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    details: input.details ?? {},
    createdAt: new Date(),
  };
  await db.insert(auditLog).values(row);
  return row;
};

/** List the audit entries that target a given user, newest first. */
export const listAuditForUser = async (
  db: DbOrTx,
  targetUserId: UserId,
): Promise<readonly AuditEntry[]> => {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.targetUserId, targetUserId))
    .orderBy(desc(auditLog.createdAt));
};
