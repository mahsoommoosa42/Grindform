/**
 * @file packages/web/src/server.ts
 *
 * The Grindform server. One Hono app mounts the JSON API under `/v1`
 * and serves the static client (built into `public/app`) for everything
 * else, with an SPA fallback to `index.html`. Run with `bun run start`;
 * Bun serves the default export.
 */

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from 'hono/bun';
import { secureHeaders } from 'hono/secure-headers';

import { createApp, seedAdminUser } from '@grindform/api';
import type { EmailSender } from '@grindform/api';
import { parseAdminEmails } from '@grindform/auth';

import { createServerDb } from './db.ts';

/** Parse an env var as a strictly-positive integer, or `undefined` if invalid. */
const parsePositiveInt = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

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
// Only a positive integer is honoured — a typo (empty/0/negative/NaN) must not
// silently weaken or disable the throttle, so we warn and fall back to default.
const rateLimitOverride = parsePositiveInt(process.env.GRINDFORM_AUTH_RATE_LIMIT);
if (process.env.GRINDFORM_AUTH_RATE_LIMIT !== undefined && rateLimitOverride === undefined) {
  console.warn(
    `Ignoring invalid GRINDFORM_AUTH_RATE_LIMIT="${process.env.GRINDFORM_AUTH_RATE_LIMIT}" ` +
      '(expected a positive integer); using the default throttle.',
  );
}
const authRateLimit =
  rateLimitOverride === undefined ? undefined : { limit: rateLimitOverride, windowMs: 15 * 60_000 };

// How many trusted reverse-proxy hops sit in front of the app. The real client
// IP for the auth throttle is read this many entries from the right of
// X-Forwarded-For, so a spoofed XFF can't bypass the limit. Defaults to 1.
const trustedProxyHops = parsePositiveInt(process.env.GRINDFORM_TRUSTED_PROXY_HOPS) ?? 1;

const app = new Hono();

// Security headers on every response: a tight CSP (the client is one
// self-hosted bundle + stylesheet), plus nosniff, no framing, a strict
// referrer policy, and HSTS in production.
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    ...(secureCookies
      ? { strictTransportSecurity: 'max-age=31536000; includeSubDomains' }
      : { strictTransportSecurity: false }),
  }),
);

// Cap request bodies so no endpoint can be fed an oversized payload. The API
// only ever ingests small JSON documents (a plan spec, a settings bag, auth
// credentials), so 128 KiB is generous.
app.use('/v1/*', bodyLimit({ maxSize: 128 * 1024 }));

// JSON API.
// When GRINDFORM_TEST_HOOKS is set, use the test email sender that captures
// verification URLs so e2e tests can verify emails without parsing stdout.
let emailSender: EmailSender | undefined;
let getLastVerifyUrl: ((email: string) => string | undefined) | undefined;
if (process.env.GRINDFORM_TEST_HOOKS === '1') {
  const hooks = await import('@grindform/api/test-hooks');
  emailSender = hooks.testEmailSender;
  getLastVerifyUrl = hooks.getLastVerifyUrl;
}

app.route(
  '/',
  createApp({
    db,
    adminEmails,
    secureCookies,
    trustedProxyHops,
    ...(authRateLimit === undefined ? {} : { authRateLimit }),
    ...(emailSender === undefined ? {} : { emailSender }),
  }),
);

// Test-only endpoint: return the last verification URL for an email.
if (getLastVerifyUrl !== undefined) {
  const hook = getLastVerifyUrl;
  app.get('/test/last-verify-url', (c) => {
    const email = c.req.query('email') ?? '';
    const url = hook(email);
    return c.json({ url: url ?? null });
  });
}

// Static assets (CSS, the bundled client, etc.).
app.use('/styles.css', serveStatic({ path: './public/styles.css' }));
app.use('/theme-init.js', serveStatic({ path: './public/theme-init.js' }));
app.use('/app/*', serveStatic({ root: './public' }));

// SPA fallback: any non-API GET serves the app shell.
app.get('*', serveStatic({ path: './public/index.html' }));

const port = Number(process.env.PORT ?? 3000);

// eslint-disable-next-line no-console
console.log(`Grindform listening on http://localhost:${port}`);

export default { port, fetch: app.fetch };
