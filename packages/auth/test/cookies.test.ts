import { describe, expect, it } from 'vitest';

import {
  buildSessionClearCookie,
  buildSessionSetCookie,
  extractSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  sessionExpiresAt,
} from '../src/cookies.ts';

describe('session cookies', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('computes a 30-day expiry', () => {
    expect(sessionExpiresAt(now).getTime()).toBe(now.getTime() + SESSION_TTL_MS);
  });

  it('builds a secure Set-Cookie with HttpOnly + SameSite=Lax + Max-Age', () => {
    const cookie = buildSessionSetCookie({
      cookieValue: 'tok',
      now,
      expiresAt: sessionExpiresAt(now),
      secure: true,
    });
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=tok`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
  });

  it('omits Secure when secure is false (local http / E2E)', () => {
    const cookie = buildSessionSetCookie({
      cookieValue: 'tok',
      now,
      expiresAt: sessionExpiresAt(now),
      secure: false,
    });
    expect(cookie).not.toContain('Secure');
  });

  it('clamps Max-Age to at least 1 second under clock skew', () => {
    const cookie = buildSessionSetCookie({
      cookieValue: 'tok',
      now,
      expiresAt: new Date(now.getTime() - 5000),
      secure: true,
    });
    expect(cookie).toContain('Max-Age=1');
  });

  it('clears the cookie with Max-Age=0, honouring the secure flag', () => {
    expect(buildSessionClearCookie(true)).toContain('Secure');
    expect(buildSessionClearCookie(true)).toContain('Max-Age=0');
    expect(buildSessionClearCookie(false)).not.toContain('Secure');
  });

  it('extracts the session value from a Cookie header', () => {
    expect(extractSessionCookie(`other=1; ${SESSION_COOKIE_NAME}=abc; x=2`)).toBe('abc');
  });

  it('returns null for absent, empty, or valueless cookies', () => {
    expect(extractSessionCookie(undefined)).toBeNull();
    expect(extractSessionCookie(null)).toBeNull();
    expect(extractSessionCookie('')).toBeNull();
    expect(extractSessionCookie('other=1')).toBeNull();
    expect(extractSessionCookie(`${SESSION_COOKIE_NAME}=`)).toBeNull();
    expect(extractSessionCookie('=novalue')).toBeNull();
  });
});
