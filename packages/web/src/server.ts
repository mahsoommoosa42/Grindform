/**
 * @file packages/web/src/server.ts
 *
 * The Grindform server. One Hono app mounts the JSON API under `/v1`
 * and serves the static client (built into `public/app`) for everything
 * else, with an SPA fallback to `index.html`. Run with `bun run start`;
 * Bun serves the default export.
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

import { createApp } from '@grindform/api';
import { parseAdminEmails } from '@grindform/auth';

import { createServerDb } from './db.ts';

const { db } = await createServerDb();

// Emails in ADMIN_EMAILS get the admin role (and the /admin console) on signup.
const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
// Session cookies are Secure unless explicitly disabled for local HTTP dev.
const secureCookies = process.env.GRINDFORM_INSECURE_COOKIES !== '1';
// Per-IP throttle on the auth endpoints; overridable so the e2e harness (which
// drives many signups from one IP) isn't tripped by the production default.
const rateLimitOverride = Number(process.env.GRINDFORM_AUTH_RATE_LIMIT);
const authRateLimit = Number.isFinite(rateLimitOverride)
  ? { limit: rateLimitOverride, windowMs: 15 * 60_000 }
  : undefined;

const app = new Hono();

// JSON API.
app.route(
  '/',
  createApp({
    db,
    adminEmails,
    secureCookies,
    ...(authRateLimit === undefined ? {} : { authRateLimit }),
  }),
);

// Static assets (CSS, the bundled client, etc.).
app.use('/styles.css', serveStatic({ path: './public/styles.css' }));
app.use('/app/*', serveStatic({ root: './public' }));

// SPA fallback: any non-API GET serves the app shell.
app.get('*', serveStatic({ path: './public/index.html' }));

const port = Number(process.env.PORT ?? 3000);

// eslint-disable-next-line no-console
console.log(`Grindform listening on http://localhost:${port}`);

export default { port, fetch: app.fetch };
