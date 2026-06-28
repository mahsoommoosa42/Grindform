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

/** Minimal request shape the key function reads. */
export interface RateLimitRequestLike {
  readonly req: { readonly header: (name: string) => string | undefined };
}

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Max requests permitted per key within a window. Must be a positive integer. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Derive the bucket key from a request (e.g. client IP). */
  readonly key: (c: RateLimitRequestLike) => string;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  readonly now?: () => number;
  /**
   * Hard ceiling on the number of buckets held in memory. Protects against
   * memory exhaustion when keys are (even partly) attacker-influenced. When
   * the map would exceed this, expired buckets are swept first and, if still
   * at the ceiling, the oldest (earliest-inserted) buckets are evicted.
   * Defaults to 50k.
   */
  readonly maxKeys?: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_MAX_KEYS = 50_000;

/**
 * Build a middleware enforcing `limit` requests per `windowMs` per key.
 * On exhaustion it throws {@link RateLimitedError} (→ 429) with a
 * `retryAfterMs` detail. Expired buckets are reset lazily on the next
 * hit for that key, and the map is bounded by `maxKeys` so a flood of
 * distinct keys can't grow it without limit.
 */
export const createRateLimiter = (options: RateLimiterOptions): MiddlewareHandler => {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const buckets = new Map<string, Bucket>();

  /** Drop every bucket whose window has already closed. */
  const sweepExpired = (current: number): void => {
    for (const [k, b] of buckets) {
      if (b.resetAt <= current) buckets.delete(k);
    }
  };

  /** Keep the map under `maxKeys`: sweep expired, then evict oldest-inserted. */
  const enforceCeiling = (current: number): void => {
    if (buckets.size < maxKeys) return;
    sweepExpired(current);
    // `Map` preserves insertion order, so iterating keys evicts oldest-first
    // until there's room for the incoming bucket.
    for (const k of buckets.keys()) {
      if (buckets.size < maxKeys) break;
      buckets.delete(k);
    }
  };

  return async (c, next) => {
    const key = options.key(c);
    const current = now();
    const existing = buckets.get(key);
    if (existing === undefined || existing.resetAt <= current) {
      enforceCeiling(current);
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
 * Build a client-IP key function that is safe behind a reverse proxy.
 *
 * `X-Forwarded-For` is a client-supplied header; only the entries appended
 * by infrastructure you control are trustworthy. A proxy appends the address
 * it received the connection from to the *right* of the chain, so the real
 * client is the entry `trustedProxyHops` from the right — anything an attacker
 * injects ends up to the *left* of that and is ignored. This closes the
 * "spoof a unique XFF per request to bypass the limit" hole.
 *
 * `trustedProxyHops` is how many proxies sit between the app and the client
 * (e.g. 1 for a single fly.io/Railway/nginx hop). With `0`, XFF is not trusted
 * at all and all header-less/proxy-less traffic shares one bucket.
 */
export const createClientIpKey =
  (trustedProxyHops: number) =>
  (c: RateLimitRequestLike): string => {
    if (trustedProxyHops > 0) {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded !== undefined && forwarded.length > 0) {
        const parts = forwarded
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        if (parts.length > 0) {
          const index = Math.max(0, parts.length - trustedProxyHops);
          return parts[index]!;
        }
      }
    }
    return c.req.header('x-real-ip') ?? 'unknown';
  };

/**
 * Default client-IP key: trusts a single proxy hop, matching Grindform's
 * single-container-behind-one-proxy deployment. Use {@link createClientIpKey}
 * to configure a different number of trusted hops.
 */
export const clientIpKey = createClientIpKey(1);
