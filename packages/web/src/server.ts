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

import { createServerDb } from './db.ts';

const { db } = await createServerDb();

const app = new Hono();

// JSON API.
app.route('/', createApp({ db }));

// Static assets (CSS, the bundled client, etc.).
app.use('/styles.css', serveStatic({ path: './public/styles.css' }));
app.use('/app/*', serveStatic({ root: './public' }));

// SPA fallback: any non-API GET serves the app shell.
app.get('*', serveStatic({ path: './public/index.html' }));

const port = Number(process.env.PORT ?? 3000);

// eslint-disable-next-line no-console
console.log(`Grindform listening on http://localhost:${port}`);

export default { port, fetch: app.fetch };
