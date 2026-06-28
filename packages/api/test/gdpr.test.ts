import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import { parseUserId } from '@grindform/core';
import { setUserStatus } from '@grindform/db';
import type { Db } from '@grindform/db';

import type { AppEnv } from '../src/context.ts';
import { freshApp, registerClient } from './helpers/db.ts';
import type { Client } from './helpers/db.ts';

const seedPlanWithLog = async (client: Client): Promise<void> => {
  const planRes = await client.json('/v1/plans', 'POST', {
    goal: 'build_muscle',
    days: [{ weekday: 'mon', sessions: [{ kind: 'training', focus: ['glutes'] }] }],
  });
  const { plan } = (await planRes.json()) as {
    plan: {
      id: string;
      days: { id: string; sessions: { blocks?: { slots: { id: string }[] }[] }[] }[];
    };
  };
  const dayId = plan.days[0]!.id;
  const slotId = plan.days[0]!.sessions.flatMap((s) => s.blocks ?? []).flatMap((b) => b.slots)[0]!
    .id;
  await client.json(`/v1/plans/${plan.id}/days/${dayId}/slots/${slotId}/complete`, 'POST', {
    loadKg: 60,
    reps: 8,
  });
};

describe('GDPR self-service', () => {
  let app: Hono<AppEnv>;
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ app, db, dispose } = await freshApp());
  });
  afterEach(async () => {
    await dispose();
  });

  describe('data export', () => {
    it('returns the account, settings, and plans as a downloadable JSON', async () => {
      const client = await registerClient(app, 'gargi@example.com');
      await client.json('/v1/settings', 'PATCH', {
        theme: 'girlypop',
        preferences: { units: 'kg' },
      });
      await seedPlanWithLog(client);

      const res = await client.request('/v1/account/export');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('grindform-export.json');
      const body = (await res.json()) as {
        account: { email: string };
        termsAcceptedAt: string;
        settings: { theme: string } | null;
        plans: { plan: { id: string }; logs: unknown[] }[];
      };
      expect(body.account.email).toBe('gargi@example.com');
      expect(typeof body.termsAcceptedAt).toBe('string');
      expect(body.settings?.theme).toBe('girlypop');
      expect(body.plans).toHaveLength(1);
      expect(body.plans[0]?.logs.length).toBeGreaterThan(0);
    });

    it('exports null settings when none were saved', async () => {
      const client = await registerClient(app);
      const res = await client.request('/v1/account/export');
      const body = (await res.json()) as { settings: unknown; plans: unknown[] };
      expect(body.settings).toBeNull();
      expect(body.plans).toEqual([]);
    });

    it('requires authentication', async () => {
      expect((await app.request('/v1/account/export')).status).toBe(401);
    });
  });

  describe('account deletion', () => {
    it('erases the account and its data and invalidates the session', async () => {
      const client = await registerClient(app, 'gone@example.com');
      await seedPlanWithLog(client);

      const res = await client.request('/v1/account', { method: 'DELETE' });
      expect(res.status).toBe(204);
      expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0');

      // The session is gone and the account can no longer log in.
      expect((await client.request('/v1/plans')).status).toBe(401);
      const login = await app.request('/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'gone@example.com', password: 'correct-horse-battery' }),
      });
      expect(login.status).toBe(401);
    });

    it('requires authentication', async () => {
      expect((await app.request('/v1/account', { method: 'DELETE' })).status).toBe(401);
    });
  });

  describe('disabled accounts', () => {
    it('blocks a disabled account with a still-live session (403)', async () => {
      const client = await registerClient(app, 'gargi@example.com');
      // Disable directly, leaving the session intact, to exercise the guard.
      await setUserStatus(db, parseUserId(client.userId), 'disabled');
      const res = await client.request('/v1/plans');
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('reports the current user as null for a disabled account', async () => {
      const client = await registerClient(app, 'gargi@example.com');
      await setUserStatus(db, parseUserId(client.userId), 'disabled');
      const res = await client.request('/v1/auth/me');
      expect((await res.json()) as { user: null }).toEqual({ user: null });
    });
  });
});
