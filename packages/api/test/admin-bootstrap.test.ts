/**
 * @file packages/api/test/admin-bootstrap.test.ts
 *
 * Unit coverage for {@link seedAdminUser}: it creates a fresh admin,
 * is idempotent on re-run, promotes a pre-existing member, and rejects
 * invalid credentials so bad env config fails loudly at boot.
 */

import { describe, expect, it } from 'vitest';

import { verifyPassword } from '@grindform/auth';
import { listAuditForUser } from '@grindform/db';

import { seedAdminUser } from '../src/admin-bootstrap.ts';
import { freshApp, registerClient } from './helpers/db.ts';

const EMAIL = 'boss@grindform.test';
const PASSWORD = 'correct-horse-battery';

describe('seedAdminUser', () => {
  it('creates a hashed admin account on a fresh database', async () => {
    const { db, dispose } = await freshApp();
    try {
      const outcome = await seedAdminUser({ db, email: EMAIL, password: PASSWORD });
      expect(outcome.action).toBe('created');
      expect(outcome.user.role).toBe('admin');
      expect(outcome.user.status).toBe('active');
      expect(outcome.user.email).toBe(EMAIL);
      // Stored hash verifies against the plaintext, and is not the plaintext.
      expect(outcome.user.passwordHash).not.toBe(PASSWORD);
      expect(await verifyPassword(PASSWORD, outcome.user.passwordHash)).toBe(true);
      const audit = await listAuditForUser(db, outcome.user.id);
      expect(audit.map((a) => a.action)).toContain('account.register');
    } finally {
      await dispose();
    }
  });

  it('normalises the email and is idempotent on re-run', async () => {
    const { db, dispose } = await freshApp();
    try {
      const first = await seedAdminUser({ db, email: ' BOSS@Grindform.test ', password: PASSWORD });
      expect(first.action).toBe('created');
      expect(first.user.email).toBe(EMAIL);
      const second = await seedAdminUser({ db, email: EMAIL, password: PASSWORD });
      expect(second.action).toBe('unchanged');
      expect(second.user.id).toBe(first.user.id);
    } finally {
      await dispose();
    }
  });

  it('promotes a pre-existing member account to admin', async () => {
    const { app, db, dispose } = await freshApp();
    try {
      const member = await registerClient(app, EMAIL, PASSWORD);
      const outcome = await seedAdminUser({ db, email: EMAIL, password: PASSWORD });
      expect(outcome.action).toBe('promoted');
      expect(outcome.user.id).toBe(member.userId);
      expect(outcome.user.role).toBe('admin');
      const audit = await listAuditForUser(db, outcome.user.id);
      expect(audit.map((a) => a.action)).toContain('admin.user.promote');
    } finally {
      await dispose();
    }
  });

  it('resets the password and revokes sessions when promoting (operator wins)', async () => {
    const { app, db, dispose } = await freshApp();
    const ATTACKER_PASSWORD = 'attacker-pre-registered-pw';
    try {
      // An attacker self-registers the bootstrap email first, with their own
      // password, hoping to ride the boot-time promotion into an admin account.
      const attacker = await registerClient(app, EMAIL, ATTACKER_PASSWORD);
      await seedAdminUser({ db, email: EMAIL, password: PASSWORD });

      // Their pre-existing session is revoked.
      expect((await attacker.request('/v1/auth/me')).status).toBe(200);
      const me = (await (await attacker.request('/v1/auth/me')).json()) as {
        user: { email: string } | null;
      };
      expect(me.user).toBeNull();

      const login = async (password: string): Promise<Response> =>
        app.request('/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: EMAIL, password }),
        });
      // The attacker's chosen password no longer works...
      expect((await login(ATTACKER_PASSWORD)).status).toBe(401);
      // ...only the operator-configured password does.
      expect((await login(PASSWORD)).status).toBe(200);
    } finally {
      await dispose();
    }
  });

  it('rejects an invalid email', async () => {
    const { db, dispose } = await freshApp();
    try {
      await expect(
        seedAdminUser({ db, email: 'not-an-email', password: PASSWORD }),
      ).rejects.toThrow();
    } finally {
      await dispose();
    }
  });

  it('rejects a too-short password', async () => {
    const { db, dispose } = await freshApp();
    try {
      await expect(seedAdminUser({ db, email: EMAIL, password: 'short' })).rejects.toThrow();
    } finally {
      await dispose();
    }
  });
});
