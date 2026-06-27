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
 * A preplanned, non-generated activity that can occupy a whole day. The
 * generator skips these days entirely (they're owned by the user).
 */
export const DayActivitySchema = z.enum(['rest', 'pilates', 'physio', 'steps', 'custom']);
export type DayActivity = z.infer<typeof DayActivitySchema>;

// ---------------------------------------------------------------------------
// Themes.
// ---------------------------------------------------------------------------

/** Visual themes. `grind` and `girlypop` are the two headline looks. */
export const ThemeIdSchema = z.enum(['grind', 'girlypop', 'minimal', 'midnight']);
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
 * accessory work. `physioMinutes` is the optional first-15-minutes
 * prehab block (0 disables it).
 */
export const TimeBudgetSchema = z.object({
  sessionMinutes: z.number().int().min(20).max(180).default(60),
  warmupMinutes: z.number().int().min(0).max(30).default(8),
  cooldownMinutes: z.number().int().min(0).max(30).default(5),
  physioMinutes: z.number().int().min(0).max(30).default(0),
});
export type TimeBudget = z.infer<typeof TimeBudgetSchema>;

/**
 * One entry in the weekly schedule: either a generated training day
 * (`focus` = the muscle groups to train) or a blocked preplanned day
 * (`activity` set, `focus` empty). Exactly one of the two modes is used,
 * enforced by {@link DaySpecSchema}'s refinement.
 */
export const DaySpecSchema = z
  .object({
    weekday: WeekdaySchema,
    activity: DayActivitySchema.optional(),
    focus: z.array(MuscleGroupSchema).default([]),
    label: z.string().min(1).max(60).optional(),
  })
  .refine((d) => d.activity !== undefined || d.focus.length > 0, {
    message: 'a day must be either a blocked activity or have a training focus',
    path: ['focus'],
  });
export type DaySpec = z.infer<typeof DaySpecSchema>;

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
  }),
  days: z.array(DaySpecSchema).min(1).max(7),
  variation: z.enum(['A', 'B']).default('A'),
  seed: z.number().int().nonnegative().optional(),
});
export type GeneratePlanInput = z.infer<typeof GeneratePlanInputSchema>;
