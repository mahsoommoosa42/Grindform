import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { isGrindformError, toErrorPayload } from '@grindform/core';
import type { StatusCode } from 'hono/utils/http-status';

import { clientIpKey, createRateLimiter } from '../src/rate-limit.ts';

const header =
  (headers: Record<string, string>) =>
  (name: string): string | undefined =>
    headers[name];

describe('clientIpKey', () => {
  it('uses the first x-forwarded-for hop when present', () => {
    expect(
      clientIpKey({ req: { header: header({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) } }),
    ).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for is empty', () => {
    expect(
      clientIpKey({ req: { header: header({ 'x-forwarded-for': '', 'x-real-ip': '9.9.9.9' }) } }),
    ).toBe('9.9.9.9');
  });

  it('falls back to a constant when no client headers exist', () => {
    expect(clientIpKey({ req: { header: header({}) } })).toBe('unknown');
  });
});

describe('createRateLimiter', () => {
  const buildApp = (now?: () => number): Hono => {
    const app = new Hono();
    app.use(
      '*',
      createRateLimiter({
        limit: 2,
        windowMs: 100,
        key: () => 'bucket',
        ...(now === undefined ? {} : { now }),
      }),
    );
    app.get('/', (c) => c.text('ok'));
    app.onError((err, c) => {
      const status: StatusCode = isGrindformError(err) ? (err.httpStatus as StatusCode) : 500;
      return c.json({ error: toErrorPayload(err) }, status);
    });
    return app;
  };

  it('permits up to the limit, then returns 429, then resets after the window', async () => {
    let t = 1000;
    const app = buildApp(() => t);

    expect((await app.request('/')).status).toBe(200); // first hit (new bucket)
    expect((await app.request('/')).status).toBe(200); // within limit
    const blocked = await app.request('/'); // limit reached
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as {
      error: { code: string; details: { retryAfterMs: number } };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details.retryAfterMs).toBeGreaterThan(0);

    t += 200; // advance past the window → bucket resets
    expect((await app.request('/')).status).toBe(200);
  });

  it('defaults the clock to Date.now when none is supplied', async () => {
    const app = buildApp();
    expect((await app.request('/')).status).toBe(200);
  });
});
