import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import type { AppEnv } from '../src/context.ts';
import { freshApp, registerClient } from './helpers/db.ts';
import type { Client } from './helpers/db.ts';

const UNKNOWN_USER = `usr_${'0'.repeat(26)}`;

describe('admin console', () => {
  let app: Hono<AppEnv>;
  let dispose: () => Promise<void>;
  let admin: Client;
  let member: Client;

  beforeEach(async () => {
    ({ app, dispose } = await freshApp({ adminEmails: new Set(['admin@example.com']) }));
    admin = await registerClient(app, 'admin@example.com');
    member = await registerClient(app, 'member@example.com');
  });
  afterEach(async () => {
    await dispose();
  });

  describe('access control', () => {
    it('rejects anonymous callers with 401', async () => {
      expect((await app.request('/v1/admin/users')).status).toBe(401);
    });

    it('rejects non-admin members with 403', async () => {
      const res = await member.request('/v1/admin/users');
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /v1/admin/users', () => {
    it('lists every account with a plan count', async () => {
      await member.json('/v1/plans', 'POST', {
        goal: 'build_muscle',
        days: [{ weekday: 'mon', sessions: [{ kind: 'training', focus: ['glutes'] }] }],
      });
      const res = await admin.request('/v1/admin/users');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        users: { email: string; planCount: number; role: string }[];
      };
      const found = body.users.find((u) => u.email === 'member@example.com');
      expect(found?.planCount).toBe(1);
      expect(body.users.some((u) => u.email === 'admin@example.com' && u.role === 'admin')).toBe(
        true,
      );
    });

    it('reports a last-login timestamp once a member has signed in', async () => {
      await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'member@example.com', password: 'correct-horse-battery' }),
      });
      const res = await admin.request('/v1/admin/users');
      const body = (await res.json()) as { users: { email: string; lastLoginAt: string | null }[] };
      const found = body.users.find((u) => u.email === 'member@example.com');
      expect(typeof found?.lastLoginAt).toBe('string');
    });
  });

  describe('GET /v1/admin/users/:userId', () => {
    it('returns the user with their audit trail', async () => {
      const res = await admin.request(`/v1/admin/users/${member.userId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        user: { email: string };
        audit: { action: string }[];
      };
      expect(body.user.email).toBe('member@example.com');
      expect(body.audit.some((a) => a.action === 'account.register')).toBe(true);
    });

    it('404s a malformed user id', async () => {
      expect((await admin.request('/v1/admin/users/not-an-id')).status).toBe(404);
    });

    it('404s an unknown user id', async () => {
      expect((await admin.request(`/v1/admin/users/${UNKNOWN_USER}`)).status).toBe(404);
    });
  });

  describe('disable / enable', () => {
    it('disables an account, revokes its sessions, and audits the action', async () => {
      const res = await admin.request(`/v1/admin/users/${member.userId}/disable`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { status: string } };
      expect(body.user.status).toBe('disabled');

      // The member's existing session no longer works.
      expect((await member.request('/v1/plans')).status).toBe(401);

      const detail = await admin.request(`/v1/admin/users/${member.userId}`);
      const detailBody = (await detail.json()) as {
        audit: { action: string; actorUserId: string }[];
      };
      const entry = detailBody.audit.find((a) => a.action === 'admin.user.disable');
      expect(entry?.actorUserId).toBe(admin.userId);
    });

    it('re-enables a disabled account', async () => {
      await admin.request(`/v1/admin/users/${member.userId}/disable`, { method: 'POST' });
      const res = await admin.request(`/v1/admin/users/${member.userId}/enable`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { status: string } };
      expect(body.user.status).toBe('active');
    });

    it('404s disabling an unknown user', async () => {
      const res = await admin.request(`/v1/admin/users/${UNKNOWN_USER}/disable`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });

    it('404s enabling an unknown user', async () => {
      const res = await admin.request(`/v1/admin/users/${UNKNOWN_USER}/enable`, { method: 'POST' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /v1/admin/users/:userId', () => {
    it('erases an account', async () => {
      const res = await admin.request(`/v1/admin/users/${member.userId}`, { method: 'DELETE' });
      expect(res.status).toBe(204);
      expect((await admin.request(`/v1/admin/users/${member.userId}`)).status).toBe(404);
    });

    it('404s deleting an unknown user', async () => {
      const res = await admin.request(`/v1/admin/users/${UNKNOWN_USER}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});
