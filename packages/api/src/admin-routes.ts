/**
 * @file packages/api/src/admin-routes.ts
 *
 * The support console's API, all under `/v1/admin` and gated by
 * {@link requireAdmin}. Admins can list accounts, inspect one (with its
 * audit trail), disable/enable an account, and erase one on request.
 * Every state-changing action writes an audit entry naming the admin who
 * performed it, so support activity is itself accountable.
 */

import type { Hono } from 'hono';

import { ForbiddenError, isUserId, NotFoundError } from '@grindform/core';
import type { UserId } from '@grindform/core';
import {
  deleteUserAndData,
  findUserById,
  listAuditForUser,
  listUsersWithStats,
  recordAudit,
  revokeAllSessionsForUser,
  setUserStatus,
} from '@grindform/db';
import type { Db } from '@grindform/db';

import { requireAdmin, requireAuth, toPublicUser } from './context.ts';
import type { AppEnv } from './context.ts';

/** Config the admin routes need from the composition root. */
export interface AdminRoutesDeps {
  readonly db: Db;
  readonly now: () => Date;
}

/** Parse a `usr_…` path parameter, 404-ing on a malformed id. */
const parseUserIdParam = (raw: string): UserId => {
  if (!isUserId(raw)) throw new NotFoundError('user not found');
  return raw;
};

/** Register the `/v1/admin/*` routes on `app`. */
export const registerAdminRoutes = (app: Hono<AppEnv>, deps: AdminRoutesDeps): void => {
  const { db } = deps;
  const guards = [requireAuth(db, deps.now), requireAdmin] as const;

  app.get('/v1/admin/users', ...guards, async (c) => {
    const users = await listUsersWithStats(db);
    return c.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt === null ? null : u.lastLoginAt.toISOString(),
        planCount: u.planCount,
      })),
    });
  });

  app.get('/v1/admin/users/:userId', ...guards, async (c) => {
    const userId = parseUserIdParam(c.req.param('userId'));
    const user = await findUserById(db, userId);
    if (user === undefined) throw new NotFoundError('user not found');
    const audit = await listAuditForUser(db, userId);
    return c.json({
      user: toPublicUser(user),
      audit: audit.map((a) => ({
        id: a.id,
        action: a.action,
        actorUserId: a.actorUserId,
        details: a.details,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  });

  app.post('/v1/admin/users/:userId/disable', ...guards, async (c) => {
    const userId = parseUserIdParam(c.req.param('userId'));
    // The caller is always an admin, so blocking self-disable also prevents
    // disabling the last remaining admin (that admin could only be yourself).
    if (userId === c.get('auth').userId) {
      throw new ForbiddenError('you cannot disable your own account');
    }
    const updated = await setUserStatus(db, userId, 'disabled');
    if (updated === undefined) throw new NotFoundError('user not found');
    await revokeAllSessionsForUser(db, userId);
    await recordAudit(db, {
      action: 'admin.user.disable',
      actorUserId: c.get('auth').userId,
      targetUserId: userId,
    });
    return c.json({ user: toPublicUser(updated) });
  });

  app.post('/v1/admin/users/:userId/enable', ...guards, async (c) => {
    const userId = parseUserIdParam(c.req.param('userId'));
    const updated = await setUserStatus(db, userId, 'active');
    if (updated === undefined) throw new NotFoundError('user not found');
    await recordAudit(db, {
      action: 'admin.user.enable',
      actorUserId: c.get('auth').userId,
      targetUserId: userId,
    });
    return c.json({ user: toPublicUser(updated) });
  });

  app.delete('/v1/admin/users/:userId', ...guards, async (c) => {
    const userId = parseUserIdParam(c.req.param('userId'));
    // As with disable: blocking self-deletion also guarantees the last admin
    // can never be removed, since that admin would have to be the caller.
    if (userId === c.get('auth').userId) {
      throw new ForbiddenError('you cannot delete your own account');
    }
    await recordAudit(db, {
      action: 'admin.user.delete',
      actorUserId: c.get('auth').userId,
      targetUserId: userId,
    });
    const deleted = await deleteUserAndData(db, userId);
    if (!deleted) throw new NotFoundError('user not found');
    return c.body(null, 204);
  });
};
