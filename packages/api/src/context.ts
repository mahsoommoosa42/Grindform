/**
 * @file packages/api/src/context.ts
 *
 * Authentication context + guard middleware. A request carries identity
 * via the session cookie; {@link resolveAuth} turns that cookie into the
 * authenticated user (or `null`), and the {@link requireAuth} /
 * {@link requireAdmin} middlewares enforce access, stashing the resolved
 * identity on the Hono context for handlers to read.
 */

import type { MiddlewareHandler } from 'hono';

import { extractSessionCookie, hashToken, isSessionActive } from '@grindform/auth';
import { ForbiddenError, UnauthorizedError } from '@grindform/core';
import type { Role, SessionId, UserId } from '@grindform/core';
import { findSessionByTokenHash, findUserById, touchSession } from '@grindform/db';
import type { Db, User } from '@grindform/db';

/** The identity attached to an authenticated request. */
export interface AuthState {
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly role: Role;
  readonly user: User;
}

/** Hono environment: handlers read the resolved identity via `c.get('auth')`. */
export interface AppEnv {
  Variables: {
    auth: AuthState;
  };
}

/** The public projection of an account — never includes the password hash. */
export interface PublicUser {
  readonly id: UserId;
  readonly email: string;
  readonly role: Role;
  readonly status: User['status'];
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly emailVerified: boolean;
}

/** Project a stored user row to its public, serialisable shape. */
export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt.toISOString(),
  lastLoginAt: user.lastLoginAt === null ? null : user.lastLoginAt.toISOString(),
  emailVerified: user.emailVerified,
});

/**
 * Resolve the request's session cookie into an authenticated user, or
 * `null` when the cookie is absent, unknown, or revoked/expired. A
 * disabled account still resolves here — the caller decides whether to
 * reject it (login does; the guards do). The session→user foreign key
 * (ON DELETE CASCADE) guarantees a live session always has its user.
 */
export const resolveAuth = async (
  db: Db,
  cookieHeader: string | null | undefined,
  now: Date,
): Promise<{ user: User; sessionId: SessionId } | null> => {
  const cookie = extractSessionCookie(cookieHeader);
  if (cookie === null) return null;
  const session = await findSessionByTokenHash(db, hashToken(cookie));
  if (session === undefined) return null;
  if (!isSessionActive(session, now)) return null;
  const user = (await findUserById(db, session.userId)) as User;
  // Slide the idle window forward on use, so an actively-used session stays
  // alive up to its absolute expiry while an abandoned one lapses sooner.
  await touchSession(db, session.id, now);
  return { user, sessionId: session.id };
};

/**
 * Build a middleware that requires a live session for an active account.
 * Rejects anonymous requests with 401 and disabled accounts with 403,
 * otherwise stashes the {@link AuthState} for downstream handlers.
 */
export const requireAuth =
  (db: Db, now: () => Date): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const resolved = await resolveAuth(db, c.req.header('cookie'), now());
    if (resolved === null) throw new UnauthorizedError('authentication required');
    if (resolved.user.status === 'disabled') throw new ForbiddenError('account disabled');
    c.set('auth', {
      userId: resolved.user.id,
      sessionId: resolved.sessionId,
      role: resolved.user.role,
      user: resolved.user,
    });
    await next();
  };

/**
 * Middleware that requires the resolved account to be an admin. Must run
 * after {@link requireAuth} (it reads the stashed identity).
 */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('auth').role !== 'admin') throw new ForbiddenError('admin access required');
  await next();
};
