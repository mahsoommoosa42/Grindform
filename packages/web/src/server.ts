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

import { createApp, seedAdminUser } from '@grindform/api';
import { parseAdminEmails } from '@grindform/auth';

import { createServerDb } from './db.ts';

const { db } = await createServerDb();

// Emails in ADMIN_EMAILS get the admin role (and the /admin console) on signup.
const adminEmails = new Set(parseAdminEmails(process.env.ADMIN_EMAILS));

// Bootstrap admin: seed (or promote) a known admin account from secrets so a
// fresh deploy always has a way into the support console without opening
// self-registration. The email is also added to the allowlist so that, if the
// account is ever deleted and re-created, it keeps the admin role.
const bootstrapEmail = process.env.GRINDFORM_ADMIN_EMAIL?.trim().toLowerCase();
const bootstrapPassword = process.env.GRINDFORM_ADMIN_PASSWORD;
if (bootstrapEmail !== undefined && bootstrapEmail.length > 0 && bootstrapPassword) {
  adminEmails.add(bootstrapEmail);
  const outcome = await seedAdminUser({ db, email: bootstrapEmail, password: bootstrapPassword });
  // eslint-disable-next-line no-console
  console.log(`Bootstrap admin ${outcome.action}: ${outcome.user.email}`);
} else if (bootstrapEmail !== undefined || bootstrapPassword !== undefined) {
  console.warn(
    'Skipping admin bootstrap: set BOTH GRINDFORM_ADMIN_EMAIL and GRINDFORM_ADMIN_PASSWORD.',
  );
}
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
