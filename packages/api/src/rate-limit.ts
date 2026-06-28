/**
 * @file packages/api/src/rate-limit.ts
 *
 * A small in-memory fixed-window rate limiter, used to blunt password
 * guessing on the auth endpoints. It's per-process (fine for the
 * single-container deploy Grindform targets); a multi-instance
 * deployment would swap the store for Redis behind the same interface.
 */

import type { MiddlewareHandler } from 'hono';

import { RateLimitedError } from '@grindform/core';

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Max requests permitted per key within a window. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Derive the bucket key from a request (e.g. client IP). */
  readonly key: (c: { req: { header: (name: string) => string | undefined } }) => string;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Build a middleware enforcing `limit` requests per `windowMs` per key.
 * On exhaustion it throws {@link RateLimitedError} (→ 429) with a
 * `retryAfterMs` detail. Expired buckets are reset lazily on the next
 * hit for that key, so the map only holds recently-active keys.
 */
export const createRateLimiter = (options: RateLimiterOptions): MiddlewareHandler => {
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  return async (c, next) => {
    const key = options.key(c);
    const current = now();
    const existing = buckets.get(key);
    if (existing === undefined || existing.resetAt <= current) {
      buckets.set(key, { count: 1, resetAt: current + options.windowMs });
      await next();
      return;
    }
    if (existing.count >= options.limit) {
      throw new RateLimitedError('too many requests, please slow down', {
        retryAfterMs: existing.resetAt - current,
      });
    }
    existing.count += 1;
    await next();
  };
};

/**
 * Best-effort client IP from common proxy headers, falling back to a
 * constant so a header-less request still shares one bucket rather than
 * bypassing the limit entirely.
 */
export const clientIpKey = (c: {
  req: { header: (name: string) => string | undefined };
}): string => {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded !== undefined && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return c.req.header('x-real-ip') ?? 'unknown';
};
