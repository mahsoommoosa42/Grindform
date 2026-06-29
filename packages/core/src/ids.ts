/**
 * @file packages/core/src/ids.ts
 *
 * Branded identifier types and constructors for every entity in the
 * Grindform domain.
 *
 * IDs are prefixed ULIDs (`exr_01HZ…`): self-describing in logs and
 * URLs, and lexicographically sortable by creation time so `ORDER BY id`
 * approximates `ORDER BY created_at`. The "brand" is a phantom type — at
 * runtime they are plain strings, but at compile time an `ExerciseId`
 * can't be passed where a `PlanId` is expected.
 */

import { ulid } from 'ulidx';

/**
 * Crockford base-32 alphabet — the character set ULID bodies use.
 * Kept as a literal here because the matcher regex needs it inline.
 */
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Standard ULID body length: 10 timestamp + 16 randomness characters. */
const ULID_LENGTH = 26;

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** Identifier for a user account. Prefix: `usr_`. */
export type UserId = Brand<string, 'UserId'>;

/** Identifier for an authenticated session. Prefix: `ses_`. */
export type SessionId = Brand<string, 'SessionId'>;

/** Identifier for an audit-log entry. Prefix: `aud_`. */
export type AuditId = Brand<string, 'AuditId'>;

/**
 * Stable identifier for a catalog exercise. Unlike the ULID-based IDs
 * below, the exercise catalog is code (not a DB table), so its entries
 * are keyed by an authored kebab-case slug (`barbell-hip-thrust`) that
 * stays stable across deploys and reads well in URLs and plan data.
 */
export type ExerciseSlug = Brand<string, 'ExerciseSlug'>;

/** Identifier for a generated weekly plan. Prefix: `pln_`. */
export type PlanId = Brand<string, 'PlanId'>;

/** Identifier for a single day within a plan. Prefix: `day_`. */
export type DayId = Brand<string, 'DayId'>;

/** Identifier for one session within a plan day. Prefix: `pss_`. */
export type PlanSessionId = Brand<string, 'PlanSessionId'>;

/** Identifier for one exercise slot inside a session. Prefix: `slt_`. */
export type SlotId = Brand<string, 'SlotId'>;

/** Identifier for a tracker log entry (a logged/completed set group). Prefix: `log_`. */
export type LogId = Brand<string, 'LogId'>;

/** Identifier for an email-verification token. Prefix: `vtk_`. */
export type VerificationTokenId = Brand<string, 'VerificationTokenId'>;

/**
 * Prefix table — single source of truth. Adding an entity means adding
 * an entry here, a branded type above, and a `newXxxId` factory below.
 */
const PREFIX = {
  user: 'usr',
  session: 'ses',
  audit: 'aud',
  plan: 'pln',
  day: 'day',
  planSession: 'pss',
  slot: 'slt',
  log: 'log',
  verificationToken: 'vtk',
} as const;

/** Build a regex matching a fully-formed ID with the given prefix. */
const matcher = (prefix: string): RegExp =>
  new RegExp(`^${prefix}_[${ULID_ALPHABET}]{${ULID_LENGTH}}$`);

/**
 * Generate a fresh `${prefix}_${ulid}` and brand it as `T`. The cast is
 * the only place we step around the brand check — safe because we
 * control both the prefix and the ULID body.
 */
const make = <T extends string>(prefix: string): T => `${prefix}_${ulid()}` as T;

/** Mint a fresh, time-sortable {@link UserId}. */
export const newUserId = (): UserId => make<UserId>(PREFIX.user);

/** Mint a fresh, time-sortable {@link SessionId}. */
export const newSessionId = (): SessionId => make<SessionId>(PREFIX.session);

/** Mint a fresh, time-sortable {@link AuditId}. */
export const newAuditId = (): AuditId => make<AuditId>(PREFIX.audit);

/** Mint a fresh, time-sortable {@link PlanId}. */
export const newPlanId = (): PlanId => make<PlanId>(PREFIX.plan);

/** Mint a fresh, time-sortable {@link DayId}. */
export const newDayId = (): DayId => make<DayId>(PREFIX.day);

/** Mint a fresh, time-sortable {@link PlanSessionId}. */
export const newPlanSessionId = (): PlanSessionId => make<PlanSessionId>(PREFIX.planSession);

/** Mint a fresh, time-sortable {@link SlotId}. */
export const newSlotId = (): SlotId => make<SlotId>(PREFIX.slot);

/** Mint a fresh, time-sortable {@link LogId}. */
export const newLogId = (): LogId => make<LogId>(PREFIX.log);

/** Mint a fresh, time-sortable {@link VerificationTokenId}. */
export const newVerificationTokenId = (): VerificationTokenId =>
  make<VerificationTokenId>(PREFIX.verificationToken);

/** Type guard: true iff `s` is a syntactically-valid {@link UserId}. */
export const isUserId = (s: string): s is UserId => matcher(PREFIX.user).test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link SessionId}. */
export const isSessionId = (s: string): s is SessionId => matcher(PREFIX.session).test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link AuditId}. */
export const isAuditId = (s: string): s is AuditId => matcher(PREFIX.audit).test(s);

/**
 * Kebab-case slug pattern for catalog exercises: lowercase alphanumerics
 * separated by single hyphens, 2–60 chars.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Type guard: true iff `s` is a syntactically-valid {@link ExerciseSlug}. */
export const isExerciseSlug = (s: string): s is ExerciseSlug =>
  s.length >= 2 && s.length <= 60 && SLUG_RE.test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link PlanId}. */
export const isPlanId = (s: string): s is PlanId => matcher(PREFIX.plan).test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link DayId}. */
export const isDayId = (s: string): s is DayId => matcher(PREFIX.day).test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link PlanSessionId}. */
export const isPlanSessionId = (s: string): s is PlanSessionId =>
  matcher(PREFIX.planSession).test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link SlotId}. */
export const isSlotId = (s: string): s is SlotId => matcher(PREFIX.slot).test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link LogId}. */
export const isLogId = (s: string): s is LogId => matcher(PREFIX.log).test(s);

/** Type guard: true iff `s` is a syntactically-valid {@link VerificationTokenId}. */
export const isVerificationTokenId = (s: string): s is VerificationTokenId =>
  matcher(PREFIX.verificationToken).test(s);

/**
 * Validate `s` and return it branded as a {@link PlanId}.
 *
 * @throws Error if `s` is not a syntactically-valid plan ID.
 */
export const parsePlanId = (s: string): PlanId => {
  if (!isPlanId(s)) throw new Error(`invalid PlanId: ${s}`);
  return s;
};

/**
 * Validate `s` and return it branded as an {@link ExerciseSlug}.
 *
 * @throws Error if `s` is not a syntactically-valid exercise slug.
 */
export const parseExerciseSlug = (s: string): ExerciseSlug => {
  if (!isExerciseSlug(s)) throw new Error(`invalid ExerciseSlug: ${s}`);
  return s;
};

/**
 * Validate `s` and return it branded as a {@link UserId}.
 *
 * @throws Error if `s` is not a syntactically-valid user ID.
 */
export const parseSessionId = (s: string): SessionId => {
  if (!isSessionId(s)) throw new Error(`invalid SessionId: ${s}`);
  return s;
};

/**
 * Validate `s` and return it branded as an {@link AuditId}.
 *
 * @throws Error if `s` is not a syntactically-valid audit ID.
 */
export const parseAuditId = (s: string): AuditId => {
  if (!isAuditId(s)) throw new Error(`invalid AuditId: ${s}`);
  return s;
};

/**
 * Validate `s` and return it branded as a {@link UserId}.
 *
 * @throws Error if `s` is not a syntactically-valid user ID.
 */
export const parseUserId = (s: string): UserId => {
  if (!isUserId(s)) throw new Error(`invalid UserId: ${s}`);
  return s;
};

/**
 * Validate `s` and return it branded as a {@link DayId}.
 *
 * @throws Error if `s` is not a syntactically-valid day ID.
 */
export const parseDayId = (s: string): DayId => {
  if (!isDayId(s)) throw new Error(`invalid DayId: ${s}`);
  return s;
};

/**
 * Validate `s` and return it branded as a {@link SlotId}.
 *
 * @throws Error if `s` is not a syntactically-valid slot ID.
 */
export const parseSlotId = (s: string): SlotId => {
  if (!isSlotId(s)) throw new Error(`invalid SlotId: ${s}`);
  return s;
};

/**
 * Validate `s` and return it branded as a {@link LogId}.
 *
 * @throws Error if `s` is not a syntactically-valid log ID.
 */
export const parseLogId = (s: string): LogId => {
  if (!isLogId(s)) throw new Error(`invalid LogId: ${s}`);
  return s;
};
