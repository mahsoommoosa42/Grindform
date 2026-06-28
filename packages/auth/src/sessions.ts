/**
 * @file packages/auth/src/sessions.ts
 *
 * Pure session helpers. The "what counts as a live session" rule lives
 * here so the login flow and the auth middleware agree on it.
 */

import { SESSION_IDLE_TTL_MS } from './cookies.ts';

/** The minimum shape the active-session predicate needs from a row. */
export interface SessionLike {
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date;
}

/**
 * A session is active iff it has not been revoked, its absolute expiry is
 * strictly in the future, AND it has been used within the idle window
 * ({@link SESSION_IDLE_TTL_MS}). The checks run in app code (not just SQL)
 * so clock skew can't let a just-expired row authenticate a request.
 */
export const isSessionActive = (session: SessionLike, now: Date): boolean =>
  session.revokedAt === null &&
  session.expiresAt.getTime() > now.getTime() &&
  now.getTime() - session.lastUsedAt.getTime() <= SESSION_IDLE_TTL_MS;
