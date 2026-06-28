/**
 * @file packages/db/src/repos/sessions-repo.ts
 *
 * Persistence for login sessions. Only the SHA-256 hash of the cookie
 * token is stored, so a read-only DB leak yields no usable sessions. The
 * active/expired decision is the auth package's job ({@link
 * isSessionActive}); this repo just reads and writes rows.
 */

import { and, eq, isNull } from 'drizzle-orm';

import type { SessionId, UserId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { sessions } from '../schema/tables.ts';

/** A `sessions` row as stored/returned. */
export type Session = typeof sessions.$inferSelect;

/** Fields needed to mint a session row. */
export interface NewSession {
  readonly id: SessionId;
  readonly userId: UserId;
  readonly tokenHash: string;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly expiresAt: Date;
}

/** Insert a session row and return it. */
export const createSession = async (db: DbOrTx, input: NewSession): Promise<Session> => {
  const row: Session = {
    id: input.id,
    userId: input.userId,
    tokenHash: input.tokenHash,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
    createdAt: new Date(),
    expiresAt: input.expiresAt,
    revokedAt: null,
  };
  await db.insert(sessions).values(row);
  return row;
};

/** Look up a session by the hash of its cookie token. */
export const findSessionByTokenHash = async (
  db: DbOrTx,
  tokenHash: string,
): Promise<Session | undefined> => {
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  return row;
};

/** Revoke a single session (idempotent). */
export const revokeSession = async (db: DbOrTx, id: SessionId): Promise<void> => {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
};

/** Revoke every live session for a user (e.g. on disable/delete). */
export const revokeAllSessionsForUser = async (db: DbOrTx, userId: UserId): Promise<void> => {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
};
