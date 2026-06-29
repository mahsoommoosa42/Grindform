/**
 * @file packages/db/src/repos/verification-tokens-repo.ts
 *
 * Persistence for email-verification tokens. Only the SHA-256 hash of
 * the raw token is stored (same approach as session tokens). A token is
 * consumed exactly once: lookup + delete in one transaction so a replay
 * can't re-verify.
 */

import { and, eq, gt, lt } from 'drizzle-orm';

import type { UserId, VerificationTokenId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { verificationTokens } from '../schema/tables.ts';

/** A `verification_tokens` row as stored/returned. */
export type VerificationToken = typeof verificationTokens.$inferSelect;

/** Fields needed to create a verification token row. */
export interface NewVerificationToken {
  readonly id: VerificationTokenId;
  readonly userId: UserId;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

/** Insert a verification token and return the stored row. */
export const createVerificationToken = async (
  db: DbOrTx,
  input: NewVerificationToken,
): Promise<VerificationToken> => {
  const row: VerificationToken = {
    id: input.id,
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    createdAt: new Date(),
  };
  await db.insert(verificationTokens).values(row);
  return row;
};

/** Look up a verification token by its hash. */
export const findVerificationTokenByHash = async (
  db: DbOrTx,
  tokenHash: string,
): Promise<VerificationToken | undefined> => {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.tokenHash, tokenHash))
    .limit(1);
  return row;
};

/**
 * Consume a verification token: find by hash, delete it, and return the
 * row. Returns `undefined` if no matching token exists. The caller
 * checks expiry in application code (like session tokens).
 */
export const consumeVerificationToken = async (
  db: DbOrTx,
  tokenHash: string,
): Promise<VerificationToken | undefined> => {
  const token = await findVerificationTokenByHash(db, tokenHash);
  if (token === undefined) return undefined;
  await db.delete(verificationTokens).where(eq(verificationTokens.id, token.id));
  return token;
};

/** Delete all verification tokens for a user (e.g. after successful verify). */
export const deleteVerificationTokensForUser = async (
  db: DbOrTx,
  userId: UserId,
): Promise<void> => {
  await db.delete(verificationTokens).where(eq(verificationTokens.userId, userId));
};

/** Delete all expired tokens (housekeeping). */
export const deleteExpiredVerificationTokens = async (db: DbOrTx, now: Date): Promise<number> => {
  const deleted = await db
    .delete(verificationTokens)
    .where(lt(verificationTokens.expiresAt, now))
    .returning({ id: verificationTokens.id });
  return deleted.length;
};

/** Count unexpired tokens for a user (for rate-limit / throttle checks). */
export const countActiveTokensForUser = async (
  db: DbOrTx,
  userId: UserId,
  now: Date,
): Promise<number> => {
  const rows = await db
    .select({ id: verificationTokens.id })
    .from(verificationTokens)
    .where(and(eq(verificationTokens.userId, userId), gt(verificationTokens.expiresAt, now)));
  return rows.length;
};
