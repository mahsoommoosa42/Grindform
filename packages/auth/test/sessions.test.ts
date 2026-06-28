import { describe, expect, it } from 'vitest';

import { isSessionActive } from '../src/sessions.ts';

describe('isSessionActive', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const future = new Date(now.getTime() + 1000);
  const past = new Date(now.getTime() - 1000);

  it('is true for an unrevoked, unexpired session', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: future }, now)).toBe(true);
  });

  it('is false once revoked', () => {
    expect(isSessionActive({ revokedAt: past, expiresAt: future }, now)).toBe(false);
  });

  it('is false once expired', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: past }, now)).toBe(false);
  });

  it('is false at the exact expiry instant (strictly future)', () => {
    expect(isSessionActive({ revokedAt: null, expiresAt: now }, now)).toBe(false);
  });
});
