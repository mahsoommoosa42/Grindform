import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import { parseUserId } from '@grindform/core';
import { setUserStatus } from '@grindform/db';
import type { Db } from '@grindform/db';

import type { AppEnv } from '../src/context.ts';
import { freshApp, registerClient } from './helpers/db.ts';

const jsonReq = async (app: Hono<AppEnv>, path: string, body: unknown): Promise<Response> =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('auth routes', () => {
  let app: Hono<AppEnv>;
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ app, db, dispose } = await freshApp());
  });
  afterEach(async () => {
    await dispose();
  });

  describe('register', () => {
    it('creates an account, sets a session cookie, and returns the public user', async () => {
      const res = await jsonReq(app, '/v1/auth/register', {
        email: 'Gargi@Example.com',
        password: 'correct-horse-battery',
        acceptTerms: true,
      });
      expect(res.status).toBe(201);
      const cookie = res.headers.get('set-cookie') ?? '';
      expect(cookie).toContain('gf_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure'); // secure cookies are the default
      const body = (await res.json()) as { user: { email: string; role: string } };
      expect(body.user.email).toBe('gargi@example.com');
      expect(body.user.role).toBe('member');
    });

    it('rejects a missing consent with 400', async () => {
      const res = await jsonReq(app, '/v1/auth/register', {
        email: 'a@example.com',
        password: 'correct-horse-battery',
        acceptTerms: false,
      });
      expect(res.status).toBe(400);
    });

    it('rejects a duplicate email with 409', async () => {
      await registerClient(app, 'dup@example.com');
      const res = await jsonReq(app, '/v1/auth/register', {
        email: 'dup@example.com',
        password: 'another-password',
        acceptTerms: true,
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('CONFLICT');
    });

    it('grants the admin role to an allowlisted email', async () => {
      ({ app, db, dispose } = await freshApp({ adminEmails: new Set(['boss@example.com']) }));
      const res = await jsonReq(app, '/v1/auth/register', {
        email: 'boss@example.com',
        password: 'correct-horse-battery',
        acceptTerms: true,
      });
      const body = (await res.json()) as { user: { role: string } };
      expect(body.user.role).toBe('admin');
    });

    it('omits the Secure attribute when secure cookies are disabled', async () => {
      ({ app, db, dispose } = await freshApp({ secureCookies: false }));
      const res = await jsonReq(app, '/v1/auth/register', {
        email: 'plain@example.com',
        password: 'correct-horse-battery',
        acceptTerms: true,
      });
      expect(res.headers.get('set-cookie') ?? '').not.toContain('Secure');
    });
  });

  describe('login', () => {
    it('authenticates valid credentials and sets a cookie', async () => {
      await registerClient(app, 'gargi@example.com', 'correct-horse-battery');
      const res = await jsonReq(app, '/v1/auth/login', {
        email: 'gargi@example.com',
        password: 'correct-horse-battery',
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie') ?? '').toContain('gf_session=');
    });

    it('rejects a wrong password with 401', async () => {
      await registerClient(app, 'gargi@example.com', 'correct-horse-battery');
      const res = await jsonReq(app, '/v1/auth/login', {
        email: 'gargi@example.com',
        password: 'wrong-password',
      });
      expect(res.status).toBe(401);
    });

    it('rejects an unknown email with 401 (no enumeration)', async () => {
      const res = await jsonReq(app, '/v1/auth/login', {
        email: 'nobody@example.com',
        password: 'whatever-password',
      });
      expect(res.status).toBe(401);
    });

    it('rejects malformed login input with 400', async () => {
      const res = await jsonReq(app, '/v1/auth/login', { email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('rejects a disabled account with 403', async () => {
      const client = await registerClient(app, 'gargi@example.com', 'correct-horse-battery');
      await setUserStatus(db, parseUserId(client.userId), 'disabled');
      const res = await jsonReq(app, '/v1/auth/login', {
        email: 'gargi@example.com',
        password: 'correct-horse-battery',
      });
      expect(res.status).toBe(403);
    });

    it('records the previous login time on a subsequent login', async () => {
      await registerClient(app, 'gargi@example.com', 'correct-horse-battery');
      const first = await jsonReq(app, '/v1/auth/login', {
        email: 'gargi@example.com',
        password: 'correct-horse-battery',
      });
      expect(
        ((await first.json()) as { user: { lastLoginAt: string | null } }).user.lastLoginAt,
      ).toBeNull();
      const second = await jsonReq(app, '/v1/auth/login', {
        email: 'gargi@example.com',
        password: 'correct-horse-battery',
      });
      const body = (await second.json()) as { user: { lastLoginAt: string | null } };
      expect(typeof body.user.lastLoginAt).toBe('string');
    });

    it('throttles repeated attempts with 429 once the per-IP limit is hit', async () => {
      ({ app, db, dispose } = await freshApp({ authRateLimit: { limit: 1, windowMs: 60_000 } }));
      const first = await jsonReq(app, '/v1/auth/login', {
        email: 'nobody@example.com',
        password: 'whatever-password',
      });
      expect(first.status).toBe(401);
      const second = await jsonReq(app, '/v1/auth/login', {
        email: 'nobody@example.com',
        password: 'whatever-password',
      });
      expect(second.status).toBe(429);
    });
  });

  describe('logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const client = await registerClient(app);
      const res = await client.request('/v1/auth/logout', { method: 'POST' });
      expect(res.status).toBe(204);
      expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
      // The cookie no longer authenticates.
      expect((await client.request('/v1/plans')).status).toBe(401);
    });

    it('requires authentication', async () => {
      expect((await app.request('/v1/auth/logout', { method: 'POST' })).status).toBe(401);
    });
  });

  describe('me', () => {
    it('returns the current user when authenticated', async () => {
      const client = await registerClient(app, 'gargi@example.com');
      const res = await client.request('/v1/auth/me');
      const body = (await res.json()) as { user: { email: string } | null };
      expect(body.user?.email).toBe('gargi@example.com');
    });

    it('returns null when anonymous', async () => {
      const res = await app.request('/v1/auth/me');
      expect((await res.json()) as { user: null }).toEqual({ user: null });
    });
  });
});
