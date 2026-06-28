import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { isGrindformError, toErrorPayload } from '@grindform/core';
import type { StatusCode } from 'hono/utils/http-status';

import { clientIpKey, createClientIpKey, createRateLimiter } from '../src/rate-limit.ts';

const header =
  (headers: Record<string, string>) =>
  (name: string): string | undefined =>
    headers[name];

describe('createClientIpKey', () => {
  it('takes the entry N hops from the right of x-forwarded-for (the real client)', () => {
    // Behind one trusted proxy, the rightmost entry is the address the proxy
    // observed; entries to its left are client-supplied and ignored.
    expect(
      clientIpKey({ req: { header: header({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) } }),
    ).toBe('5.6.7.8');
    // Behind two trusted proxies, step one further left.
    expect(
      createClientIpKey(2)({
        req: { header: header({ 'x-forwarded-for': 'spoof, 1.2.3.4, 5.6.7.8' }) },
      }),
    ).toBe('1.2.3.4');
  });

  it('clamps to the leftmost entry when there are fewer hops than configured', () => {
    expect(
      createClientIpKey(5)({ req: { header: header({ 'x-forwarded-for': '1.2.3.4' }) } }),
    ).toBe('1.2.3.4');
  });

  it('ignores blank entries in the chain', () => {
    expect(clientIpKey({ req: { header: header({ 'x-forwarded-for': '1.2.3.4, , ' }) } })).toBe(
      '1.2.3.4',
    );
  });

  it('falls back to x-real-ip when x-forwarded-for is empty', () => {
    expect(
      clientIpKey({ req: { header: header({ 'x-forwarded-for': '', 'x-real-ip': '9.9.9.9' }) } }),
    ).toBe('9.9.9.9');
  });

  it('falls back to a constant when no client headers exist', () => {
    expect(clientIpKey({ req: { header: header({}) } })).toBe('unknown');
  });

  it('does not trust x-forwarded-for when zero hops are configured', () => {
    expect(
      createClientIpKey(0)({
        req: { header: header({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '9.9.9.9' }) },
      }),
    ).toBe('9.9.9.9');
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

  // The map is keyed off a request header so each test can drive distinct
  // buckets and exercise the memory ceiling.
  const buildBoundedApp = (now: () => number, maxKeys: number): Hono => {
    const app = new Hono();
    app.use(
      '*',
      createRateLimiter({
        limit: 1,
        windowMs: 100,
        maxKeys,
        now,
        key: (c) => c.req.header('x-key') ?? 'none',
      }),
    );
    app.get('/', (c) => c.text('ok'));
    app.onError((err, c) => {
      const status: StatusCode = isGrindformError(err) ? (err.httpStatus as StatusCode) : 500;
      return c.json({ error: toErrorPayload(err) }, status);
    });
    return app;
  };
  const hit = async (app: Hono, key: string): Promise<Response> =>
    app.request('/', { headers: { 'x-key': key } });

  it('evicts the oldest live bucket when the key ceiling is reached', async () => {
    const t = 1000;
    const app = buildBoundedApp(() => t, 2);

    expect((await hit(app, 'a')).status).toBe(200);
    expect((await hit(app, 'a')).status).toBe(429); // a is now at its limit
    expect((await hit(app, 'b')).status).toBe(200); // map: a, b (full)
    expect((await hit(app, 'c')).status).toBe(200); // forces eviction of oldest (a)

    // a was evicted, so its throttle state is gone and it's allowed afresh.
    expect((await hit(app, 'a')).status).toBe(200);
  });

  it('sweeps expired buckets before evicting, keeping still-live ones', async () => {
    let t = 1000;
    const app = buildBoundedApp(() => t, 2);

    expect((await hit(app, 'a')).status).toBe(200); // a resets at 1100
    t = 1050;
    expect((await hit(app, 'b')).status).toBe(200); // b resets at 1150 (map full)
    t = 1120; // a has expired, b has not
    expect((await hit(app, 'c')).status).toBe(200); // sweep drops a, keeps b

    // b survived the sweep and is still within its window → still throttled.
    expect((await hit(app, 'b')).status).toBe(429);
  });
});
