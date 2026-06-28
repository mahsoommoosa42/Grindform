/**
 * @file packages/auth/src/admin.ts
 *
 * Admin designation. Who is an admin is decided by the deployment, not
 * by client input: the `ADMIN_EMAILS` environment variable holds a
 * comma-separated allowlist, and an account gets the `admin` role iff
 * its (normalised) email is on that list. This keeps privilege grants
 * out of the request body entirely.
 */

import type { Email, Role } from '@grindform/core';

/**
 * Parse a comma-separated `ADMIN_EMAILS` value into a normalised set.
 * Entries are trimmed and lowercased to match {@link Email} normalisation;
 * blank entries are dropped. `undefined`/empty yields an empty set (no
 * admins — the safe default).
 */
export const parseAdminEmails = (raw: string | undefined): ReadonlySet<string> => {
  const set = new Set<string>();
  if (raw === undefined) return set;
  for (const part of raw.split(',')) {
    const normalised = part.trim().toLowerCase();
    if (normalised.length > 0) set.add(normalised);
  }
  return set;
};

/** The role a freshly-registered `email` should get given the allowlist. */
export const roleForEmail = (email: Email, adminEmails: ReadonlySet<string>): Role =>
  adminEmails.has(email) ? 'admin' : 'member';
