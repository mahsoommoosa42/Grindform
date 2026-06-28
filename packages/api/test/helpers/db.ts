/**
 * @file packages/api/test/helpers/db.ts
 *
 * Per-test PGlite + Drizzle harness plus an app builder, so each
 * integration test runs against an isolated, migrated database. Helpers
 * here also register accounts and return cookie-bearing clients, since
 * every resource route now requires a live session.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Hono } from 'hono';

import type { AppEnv } from '../../src/context.ts';
import { applyMigrations, MIGRATIONS, schema } from '@grindform/db';
import type { Db } from '@grindform/db';

import { createApp } from '../../src/app.ts';
import type { ApiDeps } from '../../src/app.ts';

/** Options forwarded to {@link createApp}, minus the db. */
export type AppOptions = Omit<ApiDeps, 'db'>;

/** Spin up a fresh, migrated db plus a wired Hono app. */
export const freshApp = async (
  options: AppOptions = {},
): Promise<{
  app: Hono<AppEnv>;
  db: Db;
  dispose: () => Promise<void>;
}> => {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await applyMigrations(db, [...MIGRATIONS]);
  return {
    app: createApp({ db, ...options }),
    db,
    dispose: async () => {
      await client.close();
    },
  };
};

/** A cookie-bearing test client bound to one account. */
export interface Client {
  readonly cookie: string;
  readonly userId: string;
  readonly email: string;
  /** Issue a request with the session cookie attached. */
  readonly request: (path: string, init?: RequestInit) => Promise<Response>;
  /** Issue a JSON-body request (POST/PATCH/DELETE) with the session cookie. */
  readonly json: (path: string, method: string, body: unknown) => Promise<Response>;
}

/** Extract the `gf_session=…` pair from a Set-Cookie header. */
const cookieFrom = (setCookie: string | null): string => {
  if (setCookie === null) throw new Error('expected a Set-Cookie header');
  return setCookie.split(';')[0]!;
};

const withCookie =
  (app: Hono<AppEnv>, cookie: string): Client['request'] =>
  async (path, init = {}) =>
    app.request(path, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie },
    });

/** Register a new account and return a client carrying its session cookie. */
export const registerClient = async (
  app: Hono<AppEnv>,
  email = 'gargi@example.com',
  password = 'correct-horse-battery',
): Promise<Client> => {
  const res = await app.request('/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, acceptTerms: true }),
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  const cookie = cookieFrom(res.headers.get('set-cookie'));
  const body = (await res.json()) as { user: { id: string; email: string } };
  const request = withCookie(app, cookie);
  return {
    cookie,
    userId: body.user.id,
    email: body.user.email,
    request,
    json: (path, method, payload) =>
      request(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
  };
};
