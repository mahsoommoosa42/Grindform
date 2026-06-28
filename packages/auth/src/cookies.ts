/**
 * @file packages/auth/src/cookies.ts
 *
 * Session-cookie attributes + `Set-Cookie` serialisation, plus the
 * `Cookie:` header parser.
 *
 * ## Attributes
 *
 * - `HttpOnly` keeps the token out of JavaScript so an XSS in a Lit
 *   island can't exfiltrate it.
 * - `SameSite=Lax` blocks cross-site POSTs from carrying the cookie
 *   (CSRF) while still letting top-level navigations in.
 * - `Secure` is conditional: required in production (HTTPS), but omitted
 *   when `secure` is false so the cookie works over plain `http://` in
 *   local dev and the Playwright E2E suite. The composition root decides
 *   the flag from the environment.
 */

/** Name of the session cookie. */
export const SESSION_COOKIE_NAME = 'gf_session';

/** Absolute session TTL — 30 days from when it was minted. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Idle session TTL — 14 days. A session unused for longer than this is
 * treated as expired even before its absolute {@link SESSION_TTL_MS} is up,
 * bounding the window in which a stolen-but-idle cookie stays valid.
 */
export const SESSION_IDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Compute the `expiresAt` for a session minted at `now`. */
export const sessionExpiresAt = (now: Date): Date => new Date(now.getTime() + SESSION_TTL_MS);

/**
 * Build the `Set-Cookie` value that mints a session. `Max-Age` is
 * clamped to ≥ 1 so a clock-skew edge case (expiry at-or-before now)
 * still yields a positive age rather than telling the browser to delete
 * the just-minted cookie.
 */
export const buildSessionSetCookie = (params: {
  readonly cookieValue: string;
  readonly now: Date;
  readonly expiresAt: Date;
  readonly secure: boolean;
}): string => {
  const maxAgeSeconds = Math.max(
    1,
    Math.floor((params.expiresAt.getTime() - params.now.getTime()) / 1000),
  );
  const attrs = [
    `${SESSION_COOKIE_NAME}=${params.cookieValue}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (params.secure) attrs.push('Secure');
  return attrs.join('; ');
};

/** Build the `Set-Cookie` value that clears the session cookie. */
export const buildSessionClearCookie = (secure: boolean): string => {
  const attrs = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
};

/**
 * Extract the session cookie value from a `Cookie:` header. Returns
 * `null` if absent or empty — the request is then treated as anonymous
 * and downstream middleware decides whether to 401. The parse is strict
 * (no `decodeURIComponent`): the value is base64url, already safe.
 */
export const extractSessionCookie = (cookieHeader: string | null | undefined): string | null => {
  if (cookieHeader === null || cookieHeader === undefined || cookieHeader.length === 0) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== SESSION_COOKIE_NAME) continue;
    const value = trimmed.slice(eq + 1);
    return value.length === 0 ? null : value;
  }
  return null;
};
