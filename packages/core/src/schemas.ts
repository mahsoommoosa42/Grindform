/**
 * @file packages/core/src/schemas.ts
 *
 * Zod schemas shared across client and server. Anything entering a
 * module from outside (HTTP body, DB row, user input) is validated
 * against one of these first. Enums here are the single source of truth
 * for the vocabulary the whole app speaks: goals, muscle groups,
 * equipment, session block kinds, themes, and so on.
 */

import { z } from 'zod';

import { isExerciseSlug, isPlanId } from './ids.ts';
import type { ExerciseSlug, PlanId } from './ids.ts';

// ---------------------------------------------------------------------------
// Calendar.
// ---------------------------------------------------------------------------

/** The seven weekdays, Monday-first to match how training weeks are written. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** A day of the week. */
export const WeekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof WeekdaySchema>;

// ---------------------------------------------------------------------------
// Training vocabulary.
// ---------------------------------------------------------------------------

/** The training goal that drives generation (rep ranges, volume, rest). */
export const GoalSchema = z.enum(['build_muscle', 'lose_fat', 'build_endurance', 'recomp']);
export type Goal = z.infer<typeof GoalSchema>;

/** Primary muscle groups an exercise can target. */
export const MuscleGroupSchema = z.enum([
  'glutes',
  'hamstrings',
  'quads',
  'calves',
  'back',
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'full_body',
]);
export type MuscleGroup = z.infer<typeof MuscleGroupSchema>;

/** Equipment an exercise requires. */
export const EquipmentSchema = z.enum([
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'band',
  'bodyweight',
]);
export type Equipment = z.infer<typeof EquipmentSchema>;

/** Lifter experience level; gates exercise selection and volume. */
export const ExperienceSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type Experience = z.infer<typeof ExperienceSchema>;

/** Movement pattern — used to balance a session across push/pull/hinge/etc. */
export const MovementPatternSchema = z.enum([
  'hinge',
  'squat',
  'lunge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'isolation',
  'core',
  'carry',
  'conditioning',
]);
export type MovementPattern = z.infer<typeof MovementPatternSchema>;

/** Role an exercise plays in a session — compound main lift vs accessory. */
export const ExerciseRoleSchema = z.enum(['main', 'accessory', 'conditioning', 'mobility']);
export type ExerciseRole = z.infer<typeof ExerciseRoleSchema>;

// ---------------------------------------------------------------------------
// Session structure.
// ---------------------------------------------------------------------------

/**
 * The kind of block inside a 60-minute session. Mirrors the PDF's
 * structure: warm-up, optional physio prehab, main lift, accessories,
 * cool-down. `physio` is the dedicated first-15-minutes block.
 */
export const BlockTypeSchema = z.enum(['warmup', 'physio', 'main', 'accessory', 'cooldown']);
export type BlockType = z.infer<typeof BlockTypeSchema>;

/**
 * A self-tracked activity the user performs outside Grindform's
 * prescribed lifting — a run, a swim, a physio appointment, etc. These
 * are recorded as {@link ExternalSessionSpec | external sessions} sitting
 * alongside any training sessions on a day; the generator does not
 * prescribe exercises for them.
 */
export const ExternalActivitySchema = z.enum([
  'run',
  'walk',
  'cycle',
  'swim',
  'pilates',
  'physio',
  'mobility',
  'sport',
  'custom',
]);
export type ExternalActivity = z.infer<typeof ExternalActivitySchema>;

// ---------------------------------------------------------------------------
// Themes.
// ---------------------------------------------------------------------------

/** Visual themes. `pulse` (white/red) is the default; `grind` (dark) and `girlypop` are alternates. */
export const ThemeIdSchema = z.enum(['pulse', 'grind', 'girlypop', 'minimal']);
export type ThemeId = z.infer<typeof ThemeIdSchema>;

// ---------------------------------------------------------------------------
// Branded-id schemas (validate a string and narrow it to the brand).
// ---------------------------------------------------------------------------

/** Zod schema that accepts a string and brands it as an {@link ExerciseSlug}. */
export const ExerciseSlugSchema = z
  .string()
  .refine(isExerciseSlug, { message: 'invalid ExerciseSlug' })
  .transform((s): ExerciseSlug => s as ExerciseSlug);

/** Zod schema that accepts a string and brands it as a {@link PlanId}. */
export const PlanIdSchema = z
  .string()
  .refine(isPlanId, { message: 'invalid PlanId' })
  .transform((s): PlanId => s as PlanId);

// ---------------------------------------------------------------------------
// Value objects.
// ---------------------------------------------------------------------------

/**
 * A prescribed set/rep/rest scheme for one exercise in a session, e.g.
 * `4 × 8 @ 120s rest`. `perSide` marks unilateral work (the PDF's
 * "3 × 8/s"). `repsHigh` ≥ `repsLow`; a fixed scheme sets them equal.
 */
export const RepSchemeSchema = z
  .object({
    sets: z.number().int().min(1).max(10),
    repsLow: z.number().int().min(1).max(50),
    repsHigh: z.number().int().min(1).max(50),
    restSeconds: z.number().int().min(0).max(600),
    perSide: z.boolean().default(false),
  })
  .refine((s) => s.repsHigh >= s.repsLow, {
    message: 'repsHigh must be >= repsLow',
    path: ['repsHigh'],
  });
export type RepScheme = z.infer<typeof RepSchemeSchema>;

/**
 * Per-session time budget in minutes for the non-exercise blocks. The
 * generator subtracts these from the session length to size the main +
 * accessory work. `physioMinutes` is an optional prehab block (0
 * disables it); `physioPosition` chooses where that block sits in the
 * session — see {@link PHYSIO_POSITIONS}: 0 before the warm-up (the
 * classic "first 15"), 1 after the warm-up, 2 after the main lift, 3
 * after the accessories, 4 at the very end (before/replacing cool-down).
 *
 * A budget can be set globally for the whole plan and overridden
 * per-session, so different days can run for different lengths.
 */
export const TimeBudgetSchema = z.object({
  sessionMinutes: z.number().int().min(20).max(180).default(60),
  warmupMinutes: z.number().int().min(0).max(30).default(8),
  cooldownMinutes: z.number().int().min(0).max(30).default(5),
  physioMinutes: z.number().int().min(0).max(30).default(0),
  physioPosition: z.number().int().min(0).max(4).default(0),
});
export type TimeBudget = z.infer<typeof TimeBudgetSchema>;

/**
 * A prescribed (generated) lifting session: the muscle groups to train
 * plus an optional per-session time-budget override (so this session can
 * be longer/shorter, or place its physio block differently, than the
 * plan default). A day may hold more than one — e.g. an AM and a PM
 * session.
 */
export const TrainingSessionSpecSchema = z.object({
  kind: z.literal('training'),
  focus: z.array(MuscleGroupSchema).min(1),
  label: z.string().min(1).max(60).optional(),
  timeBudget: TimeBudgetSchema.optional(),
});
export type TrainingSessionSpec = z.infer<typeof TrainingSessionSpecSchema>;

/**
 * A self-tracked, non-prescribed session (a run, swim, physio
 * appointment, …) the user logs alongside their lifting. Grindform does
 * not generate exercises for it; it carries a planned duration only.
 */
export const ExternalSessionSpecSchema = z.object({
  kind: z.literal('external'),
  activity: ExternalActivitySchema,
  label: z.string().min(1).max(60).optional(),
  plannedMinutes: z.number().int().min(0).max(600).default(30),
});
export type ExternalSessionSpec = z.infer<typeof ExternalSessionSpecSchema>;

/** One planned session within a day — either training or external. */
export const SessionSpecSchema = z.discriminatedUnion('kind', [
  TrainingSessionSpecSchema,
  ExternalSessionSpecSchema,
]);
export type SessionSpec = z.infer<typeof SessionSpecSchema>;

/**
 * One entry in the weekly schedule: a weekday holding an ordered list of
 * sessions. A day with no sessions is a rest day. Sessions mix freely —
 * a day can have one or more training sessions and/or external sessions
 * (e.g. a morning run plus an evening lift).
 */
export const DaySpecSchema = z.object({
  weekday: WeekdaySchema,
  sessions: z.array(SessionSpecSchema).max(4).default([]),
  label: z.string().min(1).max(60).optional(),
});
export type DaySpec = z.infer<typeof DaySpecSchema>;

/**
 * Human-readable labels for the {@link TimeBudget.physioPosition} anchor
 * points, indexed 0–4. Exposed so the UI and generator share one source
 * of truth for where a physio block can sit in a session.
 */
export const PHYSIO_POSITIONS: readonly string[] = [
  'Before warm-up',
  'After warm-up',
  'After main lift',
  'After accessories',
  'At the end',
];

/**
 * The full input that drives weekly plan generation. `daysPerWeek` is
 * derived from `days` but kept explicit so the API can validate the two
 * agree. `variation` selects the A/B option set (PDF: alternate weekly).
 */
export const GeneratePlanInputSchema = z.object({
  goal: GoalSchema,
  experience: ExperienceSchema.default('intermediate'),
  equipment: z
    .array(EquipmentSchema)
    .min(1)
    .default([...EquipmentSchema.options]),
  timeBudget: TimeBudgetSchema.default({
    sessionMinutes: 60,
    warmupMinutes: 8,
    cooldownMinutes: 5,
    physioMinutes: 0,
    physioPosition: 0,
  }),
  days: z.array(DaySpecSchema).min(1).max(7),
  variation: z.enum(['A', 'B']).default('A'),
  seed: z.number().int().nonnegative().optional(),
});
export type GeneratePlanInput = z.infer<typeof GeneratePlanInputSchema>;

// ---------------------------------------------------------------------------
// Accounts & authentication.
// ---------------------------------------------------------------------------

/**
 * Account role. `member` is the default for every self-registered user;
 * `admin` unlocks the support console. Admin status is granted by the
 * server (env allowlist), never by client input.
 */
export const RoleSchema = z.enum(['member', 'admin']);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Account lifecycle status. `active` accounts can sign in; `disabled`
 * accounts are blocked by support without losing their data (a GDPR-safe
 * alternative to deletion).
 */
export const AccountStatusSchema = z.enum(['active', 'disabled']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

/**
 * An email address, normalised to lowercase and trimmed. Length-capped
 * to fit a btree index and reject pathological input. The regex is the
 * deliberately-simple "has an @ with something either side and a dotted
 * domain" check — full RFC 5322 validation is famously not worth it.
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'enter a valid email address' });
export type Email = z.infer<typeof EmailSchema>;

/**
 * A plaintext password at registration. Floor of 8 (NIST 800-63B) and a
 * ceiling of 200 to bound the scrypt work an attacker can force per
 * request. We deliberately don't mandate character classes — length is
 * what matters and composition rules push users toward weaker patterns.
 */
export const PasswordSchema = z.string().min(8).max(200);

/**
 * Registration input. `acceptTerms` must be literally `true` — the
 * consent checkbox is a GDPR lawful-basis record, so the schema refuses
 * a missing or false value rather than silently defaulting it.
 */
export const RegisterInputSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'you must accept the terms to create an account' }),
  }),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/** Login input. The password is only length-bounded, not policy-checked. */
export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/**
 * A support action recorded in the audit log. The vocabulary is closed
 * so the admin UI and the retention policy can both reason about it.
 */
export const AuditActionSchema = z.enum([
  'account.register',
  'account.login',
  'account.logout',
  'account.export',
  'account.delete',
  'admin.user.disable',
  'admin.user.enable',
  'admin.user.delete',
  'admin.user.promote',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;
