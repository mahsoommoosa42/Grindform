/**
 * @file packages/api/src/admin-bootstrap.ts
 *
 * Startup seeding of the bootstrap admin account. A deployment supplies
 * `GRINDFORM_ADMIN_EMAIL` + `GRINDFORM_ADMIN_PASSWORD`; on boot we ensure
 * exactly one known admin exists so the support console is reachable on a
 * fresh database without opening self-registration.
 *
 * Idempotent: if the account already exists and is already an admin it is
 * left untouched. If it exists but isn't an admin (e.g. someone
 * self-registered the bootstrap email first to try to ride the promotion
 * into admin), it is promoted to `admin` AND its password is reset to the
 * operator-configured one — so the operator's credentials always win and a
 * pre-registration attacker is locked out. Its existing sessions are revoked
 * for the same reason. The password is hashed with scrypt before storage —
 * the plaintext only lives in the env var.
 */

import { hashPassword } from '@grindform/auth';
import { EmailSchema, newUserId, PasswordSchema } from '@grindform/core';
import {
  createUser,
  findUserByEmail,
  recordAudit,
  revokeAllSessionsForUser,
  setUserRole,
  updateUserPassword,
} from '@grindform/db';
import type { Db, User } from '@grindform/db';

/** Inputs for seeding the bootstrap admin. */
export interface SeedAdminDeps {
  readonly db: Db;
  readonly email: string;
  readonly password: string;
  /** Injectable clock, for deterministic tests. Defaults to `() => new Date()`. */
  readonly now?: () => Date;
}

/** What {@link seedAdminUser} did, for logging at the call site. */
export type SeedAdminOutcome =
  | { readonly action: 'created'; readonly user: User }
  | { readonly action: 'promoted'; readonly user: User }
  | { readonly action: 'unchanged'; readonly user: User };

/**
 * Ensure an admin account exists for `email`/`password`.
 *
 * Throws if the email or password fail validation (bad env config should
 * fail loudly at boot rather than silently skipping the seed).
 */
export const seedAdminUser = async (deps: SeedAdminDeps): Promise<SeedAdminOutcome> => {
  const { db } = deps;
  const email = EmailSchema.parse(deps.email);
  const password = PasswordSchema.parse(deps.password);
  const now = (deps.now ?? ((): Date => new Date()))();

  const existing = await findUserByEmail(db, email);
  if (existing !== undefined) {
    if (existing.role === 'admin') return { action: 'unchanged', user: existing };
    // A non-admin account already holds the bootstrap email. Promote it, but
    // also reset its password to the operator's and revoke its sessions, so a
    // pre-registration attacker can't keep access to the now-admin account.
    const passwordHash = await hashPassword(password);
    await setUserRole(db, existing.id, 'admin');
    await updateUserPassword(db, existing.id, passwordHash);
    await revokeAllSessionsForUser(db, existing.id);
    const promoted: User = { ...existing, role: 'admin', passwordHash, updatedAt: now };
    await recordAudit(db, {
      action: 'admin.user.promote',
      actorUserId: promoted.id,
      targetUserId: promoted.id,
    });
    return { action: 'promoted', user: promoted };
  }

  const user = await createUser(db, {
    id: newUserId(),
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
    status: 'active',
    termsAcceptedAt: now,
  });
  await recordAudit(db, {
    action: 'account.register',
    actorUserId: user.id,
    targetUserId: user.id,
  });
  return { action: 'created', user };
};
