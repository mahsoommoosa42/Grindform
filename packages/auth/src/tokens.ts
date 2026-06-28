/**
 * @file packages/auth/src/tokens.ts
 *
 * Opaque session tokens.
 *
 * ## Threat model
 *
 * - **Unguessable.** 32 bytes of cryptographic randomness → 256 bits of
 *   entropy, so collisions are computationally indistinguishable from
 *   impossible and we don't check uniqueness on insert.
 * - **Database-breach resistant.** The server stores a SHA-256 hash,
 *   never the raw token. A read-only DB leak yields no working sessions.
 * - **Constant-time verify.** {@link verifyToken} compares hashes with
 *   `timingSafeEqual` so timing doesn't leak prefix information.
 *
 * The raw token is base64url (43 chars, no padding) so it's URL- and
 * cookie-safe without escaping.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 bytes (256 bits) of randomness, per OWASP session-id guidance. */
const TOKEN_BYTES = 32;

/** Encoded length of a fresh token: 32 bytes → 43 base64url chars. */
export const TOKEN_LENGTH = 43;

/**
 * Mint a fresh random session token. The caller stores
 * {@link hashToken}`(token)` and hands the raw value to the cookie; the
 * raw token is never persisted server-side.
 */
export const generateSessionToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

/**
 * SHA-256 hex digest of a token. Hex (not base64) so the column is
 * fixed-length (64 chars) and compares cleanly as Postgres `text`.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Constant-time check that `presented` hashes to `expectedHash`. Returns
 * `false` for an empty token or a length-mismatched (tampered) stored
 * hash, both without a timing leak.
 */
export const verifyToken = (presented: string, expectedHash: string): boolean => {
  if (presented.length === 0) return false;
  const presentedHash = hashToken(presented);
  if (presentedHash.length !== expectedHash.length) return false;
  return timingSafeEqual(Buffer.from(presentedHash, 'utf8'), Buffer.from(expectedHash, 'utf8'));
};
