/**
 * @file packages/api/src/index.ts
 *
 * Public barrel for `@grindform/api` — the Hono app factory and its deps.
 */

export { createApp, SINGLE_USER_ID } from './app.ts';
export type { ApiDeps } from './app.ts';
