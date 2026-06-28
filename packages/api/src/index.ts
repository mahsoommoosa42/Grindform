/**
 * @file packages/api/src/index.ts
 *
 * Public barrel for `@grindform/api` — the Hono app factory and its deps.
 */

export { createApp } from './app.ts';
export type { ApiDeps } from './app.ts';
export { seedAdminUser } from './admin-bootstrap.ts';
export type { SeedAdminDeps, SeedAdminOutcome } from './admin-bootstrap.ts';
export type { AppEnv, AuthState, PublicUser } from './context.ts';
export { toPublicUser } from './context.ts';
export { clientIpKey, createRateLimiter } from './rate-limit.ts';
export type { RateLimiterOptions } from './rate-limit.ts';
