import { describe, expect, it } from 'vitest';

import { generateSessionToken, hashToken, TOKEN_LENGTH, verifyToken } from '../src/tokens.ts';

describe('session tokens', () => {
  it('mints unique base64url tokens of the documented length', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toHaveLength(TOKEN_LENGTH);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it('hashes to a 64-char hex digest', () => {
    const hash = hashToken('some-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('some-token')).toBe(hash);
  });

  it('verifies a token against its own hash', () => {
    const token = generateSessionToken();
    expect(verifyToken(token, hashToken(token))).toBe(true);
  });

  it('rejects a mismatched token', () => {
    expect(verifyToken('wrong', hashToken('right'))).toBe(false);
  });

  it('rejects an empty presented token', () => {
    expect(verifyToken('', hashToken('right'))).toBe(false);
  });

  it('rejects a length-mismatched (tampered) stored hash', () => {
    expect(verifyToken('right', 'deadbeef')).toBe(false);
  });
});
