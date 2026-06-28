/**
 * @file packages/api/src/auth-routes.ts
 *
 * Account & session endpoints: register, login, logout, "who am I", plus
 * the two GDPR self-service routes (data export and account erasure).
 *
 * Sessions are cookie-based: a successful register/login mints an opaque
 * token, stores only its hash, and sets an HttpOnly cookie. Login
 * deliberately returns the same "invalid email or password" for unknown
 * emails and wrong passwords, and verifies against a dummy hash when the
 * email is unknown so response timing doesn't reveal which accounts exist.
 */

import type { Context, Hono } from 'hono';

import {
  buildSessionClearCookie,
  buildSessionSetCookie,
  generateSessionToken,
  hashPassword,
  hashToken,
  roleForEmail,
  sessionExpiresAt,
  verifyPassword,
} from '@grindform/auth';
import {
  ConflictError,
  ForbiddenError,
  LoginInputSchema,
  newSessionId,
  newUserId,
  RegisterInputSchema,
  UnauthorizedError,
} from '@grindform/core';
import {
  createSession,
  createUser,
  deleteUserAndData,
  findUserByEmail,
  getPlan,
  getSettings,
  listLogsForDay,
  listPlanIdsForUser,
  recordAudit,
  revokeSession,
  touchLastLogin,
} from '@grindform/db';
import type { Db, User } from '@grindform/db';
import type { WeeklyPlan } from '@grindform/planner';

import { requireAuth, resolveAuth, toPublicUser } from './context.ts';
import type { AppEnv } from './context.ts';
import { createClientIpKey, createRateLimiter } from './rate-limit.ts';
import { parseOrThrow } from './validation.ts';

/** Config the auth routes need from the composition root. */
export interface AuthRoutesDeps {
  readonly db: Db;
  readonly adminEmails: ReadonlySet<string>;
  readonly secureCookies: boolean;
  readonly now: () => Date;
  /** Per-IP attempt cap for register/login. Defaults to 20 per 15 minutes. */
  readonly authRateLimit?: { readonly limit: number; readonly windowMs: number };
  /**
   * Number of trusted reverse-proxy hops in front of the app, used to read the
   * real client IP from `X-Forwarded-For` for the auth throttle. Defaults to 1
   * (single-container-behind-one-proxy). See {@link createClientIpKey}.
   */
  readonly trustedProxyHops?: number;
}

/**
 * A valid-format scrypt hash that no real password matches, computed
 * once and reused. Verifying a login for an unknown email against this
 * keeps the "user missing" path the same cost as the "wrong password"
 * path, closing the timing side-channel for account enumeration.
 */
let dummyHashPromise: Promise<string> | null = null;
const dummyHash = (): Promise<string> =>
  (dummyHashPromise ??= hashPassword('\0unused-placeholder'));

/** Mint a session for `user`, persist it, and attach the Set-Cookie header. */
const issueSession = async (
  deps: AuthRoutesDeps,
  c: Context<AppEnv>,
  user: User,
  now: Date,
): Promise<void> => {
  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt(now);
  await createSession(deps.db, {
    id: newSessionId(),
    userId: user.id,
    tokenHash: hashToken(token),
    userAgent: c.req.header('user-agent') ?? null,
    ipAddress: c.req.header('x-forwarded-for') ?? null,
    expiresAt,
  });
  c.header(
    'set-cookie',
    buildSessionSetCookie({ cookieValue: token, now, expiresAt, secure: deps.secureCookies }),
  );
};

/** Register the `/v1/auth/*` and `/v1/account/*` routes on `app`. */
export const registerAuthRoutes = (app: Hono<AppEnv>, deps: AuthRoutesDeps): void => {
  const { db } = deps;
  const guard = requireAuth(db, deps.now);
  const limit = deps.authRateLimit?.limit ?? 20;
  const windowMs = deps.authRateLimit?.windowMs ?? 15 * 60 * 1000;
  const throttle = createRateLimiter({
    limit,
    windowMs,
    key: createClientIpKey(deps.trustedProxyHops ?? 1),
  });

  app.post('/v1/auth/register', throttle, async (c) => {
    const body = parseOrThrow(RegisterInputSchema, await c.req.json(), 'registration');
    if ((await findUserByEmail(db, body.email)) !== undefined) {
      throw new ConflictError('an account with that email already exists');
    }
    const now = deps.now();
    const user = await createUser(db, {
      id: newUserId(),
      email: body.email,
      passwordHash: await hashPassword(body.password),
      role: roleForEmail(body.email, deps.adminEmails),
      status: 'active',
      termsAcceptedAt: now,
    });
    await issueSession(deps, c, user, now);
    await recordAudit(db, {
      action: 'account.register',
      actorUserId: user.id,
      targetUserId: user.id,
    });
    return c.json({ user: toPublicUser(user) }, 201);
  });

  app.post('/v1/auth/login', throttle, async (c) => {
    const body = parseOrThrow(LoginInputSchema, await c.req.json(), 'login');
    const user = await findUserByEmail(db, body.email);
    const storedHash = user?.passwordHash ?? (await dummyHash());
    const ok = await verifyPassword(body.password, storedHash);
    if (user === undefined || !ok) {
      throw new UnauthorizedError('invalid email or password');
    }
    if (user.status === 'disabled') throw new ForbiddenError('account disabled');
    const now = deps.now();
    await touchLastLogin(db, user.id, now);
    await issueSession(deps, c, user, now);
    await recordAudit(db, { action: 'account.login', actorUserId: user.id, targetUserId: user.id });
    return c.json({ user: toPublicUser(user) });
  });

  app.post('/v1/auth/logout', guard, async (c) => {
    const { userId, sessionId } = c.get('auth');
    await revokeSession(db, sessionId);
    await recordAudit(db, { action: 'account.logout', actorUserId: userId, targetUserId: userId });
    c.header('set-cookie', buildSessionClearCookie(deps.secureCookies));
    return c.body(null, 204);
  });

  app.get('/v1/auth/me', async (c) => {
    const resolved = await resolveAuth(db, c.req.header('cookie'), deps.now());
    const isActive = resolved !== null && resolved.user.status === 'active';
    return c.json({ user: isActive ? toPublicUser(resolved.user) : null });
  });

  app.get('/v1/account/export', guard, async (c) => {
    const { userId, user } = c.get('auth');
    const planIds = await listPlanIdsForUser(db, userId);
    const plans = [];
    for (const planId of planIds) {
      // The id came straight from listPlanIdsForUser, so the plan exists.
      const plan = (await getPlan(db, planId)) as WeeklyPlan;
      const logs = [];
      for (const day of plan.days) logs.push(...(await listLogsForDay(db, day.id)));
      plans.push({ plan, logs });
    }
    const settings = await getSettings(db, userId);
    await recordAudit(db, { action: 'account.export', actorUserId: userId, targetUserId: userId });
    c.header('content-disposition', 'attachment; filename="grindform-export.json"');
    return c.json({
      exportedAt: deps.now().toISOString(),
      account: toPublicUser(user),
      termsAcceptedAt: user.termsAcceptedAt.toISOString(),
      settings:
        settings === undefined
          ? null
          : { theme: settings.theme, preferences: settings.preferences },
      plans,
    });
  });

  app.delete('/v1/account', guard, async (c) => {
    const { userId } = c.get('auth');
    await recordAudit(db, { action: 'account.delete', actorUserId: userId, targetUserId: userId });
    await deleteUserAndData(db, userId);
    c.header('set-cookie', buildSessionClearCookie(deps.secureCookies));
    return c.body(null, 204);
  });
};
