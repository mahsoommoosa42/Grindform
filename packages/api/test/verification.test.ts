import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import type { AppEnv } from '../src/context.ts';
import type { EmailSender } from '../src/email.ts';
import { createConsoleEmailSender } from '../src/email.ts';
import { freshApp, registerClient } from './helpers/db.ts';

const jsonReq = async (app: Hono<AppEnv>, path: string, body: unknown): Promise<Response> =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Extract the raw token from a captured verification URL. */
const extractToken = (url: string): string => {
  const u = new URL(url, 'http://localhost');
  return u.searchParams.get('verify') ?? '';
};

describe('email-verification endpoints', () => {
  let app: Hono<AppEnv>;
  let dispose: () => Promise<void>;
  let sentEmails: { to: string; url: string }[];
  let emailSender: EmailSender;

  beforeEach(async () => {
    sentEmails = [];
    emailSender = createConsoleEmailSender((to, url) => sentEmails.push({ to, url }));
    ({ app, dispose } = await freshApp({ emailSender, baseUrl: 'http://localhost:3000' }));
  });
  afterEach(async () => {
    await dispose();
  });

  describe('register creates an unverified user', () => {
    it('returns emailVerified=false and sends a verification email', async () => {
      const res = await jsonReq(app, '/v1/auth/register', {
        email: 'new@example.com',
        password: 'correct-horse-battery',
        acceptTerms: true,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        user: { email: string; emailVerified: boolean };
      };
      expect(body.user.email).toBe('new@example.com');
      expect(body.user.emailVerified).toBe(false);
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]!.to).toBe('new@example.com');
      expect(sentEmails[0]!.url).toContain('verify=');
    });
  });

  describe('POST /v1/auth/verify', () => {
    it('verifies a valid unexpired token', async () => {
      await jsonReq(app, '/v1/auth/register', {
        email: 'verify@example.com',
        password: 'correct-horse-battery',
        acceptTerms: true,
      });
      const rawToken = extractToken(sentEmails[0]!.url);
      const res = await jsonReq(app, '/v1/auth/verify', { token: rawToken });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; user: { emailVerified: boolean } };
      expect(body.ok).toBe(true);
      expect(body.user.emailVerified).toBe(true);
    });

    it('rejects a replayed (already-consumed) token', async () => {
      await jsonReq(app, '/v1/auth/register', {
        email: 'replay@example.com',
        password: 'correct-horse-battery',
        acceptTerms: true,
      });
      const rawToken = extractToken(sentEmails[0]!.url);
      await jsonReq(app, '/v1/auth/verify', { token: rawToken });
      const res = await jsonReq(app, '/v1/auth/verify', { token: rawToken });
      expect(res.status).toBe(400);
    });

    it('rejects an unknown token with a generic error (no enumeration)', async () => {
      const res = await jsonReq(app, '/v1/auth/verify', { token: 'bogus-token' });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toBe('invalid or expired verification link');
    });

    it('rejects an empty token', async () => {
      const res = await jsonReq(app, '/v1/auth/verify', { token: '' });
      expect(res.status).toBe(400);
    });

    it('rejects a missing token field', async () => {
      const res = await jsonReq(app, '/v1/auth/verify', {});
      expect(res.status).toBe(400);
    });

    it('rejects an expired token', async () => {
      // Create app with a clock that we can advance.
      const fakeNow = new Date('2025-01-01T00:00:00Z');
      ({ app, dispose } = await freshApp({
        emailSender,
        baseUrl: 'http://localhost:3000',
        now: () => fakeNow,
      }));
      sentEmails = [];
      await jsonReq(app, '/v1/auth/register', {
        email: 'expired@example.com',
        password: 'correct-horse-battery',
        acceptTerms: true,
      });
      const rawToken = extractToken(sentEmails[0]!.url);
      // Advance the clock past the 24h TTL.
      fakeNow.setTime(fakeNow.getTime() + 25 * 60 * 60 * 1000);
      const res = await jsonReq(app, '/v1/auth/verify', { token: rawToken });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/auth/resend-verification', () => {
    it('resends a verification email for an unverified user', async () => {
      const client = await registerClient(app, 'resend@example.com');
      sentEmails = [];
      const res = await client.json('/v1/auth/resend-verification', 'POST', {});
      expect(res.status).toBe(200);
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0]!.to).toBe('resend@example.com');
    });

    it('returns ok with message when user is already verified', async () => {
      const client = await registerClient(app, 'already@example.com');
      // Verify the email first.
      const rawToken = extractToken(sentEmails.find((e) => e.to === 'already@example.com')!.url);
      await jsonReq(app, '/v1/auth/verify', { token: rawToken });
      sentEmails = [];
      const res = await client.json('/v1/auth/resend-verification', 'POST', {});
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; message: string };
      expect(body.message).toBe('email already verified');
      expect(sentEmails).toHaveLength(0);
    });

    it('throttles after too many pending tokens', async () => {
      const client = await registerClient(app, 'flood@example.com');
      // Register already created 1 token. Send 4 more to hit the cap of 5.
      for (let i = 0; i < 4; i++) {
        await client.json('/v1/auth/resend-verification', 'POST', {});
      }
      const res = await client.json('/v1/auth/resend-verification', 'POST', {});
      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await jsonReq(app, '/v1/auth/resend-verification', {});
      expect(res.status).toBe(401);
    });
  });

  describe('me returns emailVerified', () => {
    it('returns emailVerified=false for unverified user', async () => {
      const client = await registerClient(app, 'me-check@example.com');
      const res = await client.request('/v1/auth/me');
      const body = (await res.json()) as { user: { emailVerified: boolean } | null };
      expect(body.user?.emailVerified).toBe(false);
    });

    it('returns emailVerified=true after verification', async () => {
      const client = await registerClient(app, 'me-verified@example.com');
      const rawToken = extractToken(
        sentEmails.find((e) => e.to === 'me-verified@example.com')!.url,
      );
      await jsonReq(app, '/v1/auth/verify', { token: rawToken });
      const res = await client.request('/v1/auth/me');
      const body = (await res.json()) as { user: { emailVerified: boolean } | null };
      expect(body.user?.emailVerified).toBe(true);
    });
  });
});
