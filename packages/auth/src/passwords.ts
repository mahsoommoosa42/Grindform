/**
 * @file packages/auth/src/passwords.ts
 *
 * scrypt-based password hashing.
 *
 * ## Why scrypt
 *
 * - **In the stdlib.** `node:crypto.scrypt` ships with Node and Bun, so
 *   there's no native module to install — important for a workout app
 *   that should deploy unchanged to a VPS, Railway, or fly.io.
 * - **Memory-hard.** scrypt's `N` parameter forces the attacker to
 *   allocate `N × 128 × r` bytes per guess, bounding GPU/ASIC speedups
 *   by memory bandwidth rather than raw FLOPS.
 * - Argon2id is the modern best-in-class but ships only as a native
 *   module. The public surface here (`hashPassword` / `verifyPassword`)
 *   is identifier-prefixed (`$scrypt$…`) so a future migration to argon2
 *   is a one-file change that can recognise both formats.
 *
 * ## Hash format
 *
 * ```
 * $scrypt$N=32768,r=8,p=1$<base64-salt>$<base64-hash>
 * ```
 *
 * Parameters are stored inline so tightening them later doesn't
 * invalidate existing passwords — the verifier reads the stored prefix.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = {
  N: 32_768,
  r: 8,
  p: 1,
  dkLen: 64,
  saltBytes: 16,
} as const;

const FORMAT_PREFIX = '$scrypt$';

/**
 * scrypt's `maxmem` defaults to 32 MB, below the ~64 MB working set our
 * parameters need. An explicit generous bound (≥ 128 × N × r) prevents
 * `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` and leaves headroom for param bumps.
 */
const MAXMEM = 64 * 1024 * 1024;

/** Hash a plaintext password against fresh per-record parameters. */
export const hashPassword = async (plaintext: string): Promise<string> => {
  const salt = randomBytes(PARAMS.saltBytes);
  const derived = await scryptAsync(plaintext, salt, PARAMS.dkLen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAXMEM,
  });
  return `${FORMAT_PREFIX}N=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
};

/** Parsed representation of the hash envelope. Internal. */
interface ParsedHash {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

/**
 * Parse the `$scrypt$N=…,r=…,p=…$salt$hash` envelope. Returns `null` on
 * any malformed input rather than throwing — `verifyPassword` collapses
 * null into "no match" so a tampered row can never log the attacker in.
 */
const parseHash = (encoded: string): ParsedHash | null => {
  if (!encoded.startsWith(FORMAT_PREFIX)) return null;
  const body = encoded.slice(FORMAT_PREFIX.length);
  const segments = body.split('$');
  if (segments.length !== 3) return null;
  const [paramSegment, saltSegment, hashSegment] = segments;
  if (
    paramSegment === undefined ||
    saltSegment === undefined ||
    hashSegment === undefined ||
    paramSegment.length === 0 ||
    saltSegment.length === 0 ||
    hashSegment.length === 0
  ) {
    return null;
  }
  const params: Record<string, number> = {};
  for (const pair of paramSegment.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) return null;
    const key = pair.slice(0, eq);
    const value = Number.parseInt(pair.slice(eq + 1), 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    params[key] = value;
  }
  const N = params['N'];
  const r = params['r'];
  const p = params['p'];
  if (N === undefined || r === undefined || p === undefined) return null;
  return {
    N,
    r,
    p,
    salt: Buffer.from(saltSegment, 'base64'),
    hash: Buffer.from(hashSegment, 'base64'),
  };
};

/**
 * Constant-time password verification against an encoded hash. Returns
 * `false` on a malformed envelope or a hash mismatch. Re-deriving with
 * `parsed.hash.length` keeps the buffers the same length, so
 * `timingSafeEqual` can run without a separate length guard.
 */
export const verifyPassword = async (plaintext: string, encoded: string): Promise<boolean> => {
  const parsed = parseHash(encoded);
  if (parsed === null) return false;
  const derived = await scryptAsync(plaintext, parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: MAXMEM,
  });
  return timingSafeEqual(derived, parsed.hash);
};
