import { describe, expect, it } from 'vitest';

import { SESSION_IDLE_TTL_MS } from '../src/cookies.ts';
import { isSessionActive } from '../src/sessions.ts';

describe('isSessionActive', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);

  it('is true for an unrevoked, unexpired, recently-used session', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: future, lastUsedAt: now }, now)).toBe(
      true,
    );
  });

  it('is false once revoked', () => {
    expect(isSessionActive({ revokedAt: past, expiresAt: future, lastUsedAt: now }, now)).toBe(
      false,
    );
  });

  it('is false once expired', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: past, lastUsedAt: now }, now)).toBe(false);
  });

  it('is false at the exact expiry instant (strictly future)', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: now, lastUsedAt: now }, now)).toBe(false);
  });

  it('is false once idle past the idle window, even before absolute expiry', () => {
    const lastUsedAt = new Date(now.getTime() - SESSION_IDLE_TTL_MS - 1);
    expect(isSessionActive({ revokedAt: null, expiresAt: future, lastUsedAt }, now)).toBe(false);
  });

  it('is true at the exact idle boundary (inclusive)', () => {
    const lastUsedAt = new Date(now.getTime() - SESSION_IDLE_TTL_MS);
    expect(isSessionActive({ revokedAt: null, expiresAt: future, lastUsedAt }, now)).toBe(true);
  });
});
