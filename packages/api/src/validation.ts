/**
 * @file packages/api/src/validation.ts
 *
 * Request-validation helpers and the Zod schemas for HTTP inputs that
 * aren't already defined in `@grindform/core`. Anything crossing the
 * network boundary is parsed here and turned into a {@link ValidationError}
 * (→ 400) on failure, so route handlers only ever see well-typed data.
 */

import { z } from 'zod';

import {
  BlockTypeSchema,
  CustomExerciseInputSchema,
  EquipmentSchema,
  ExerciseRoleSchema,
  ExerciseSlugSchema,
  ExperienceSchema,
  ExternalActivitySchema,
  GoalSchema,
  isCustomExerciseId,
  isDayId,
  isPlanSessionId,
  isSlotId,
  MovementPatternSchema,
  MuscleGroupSchema,
  RepSchemeSchema,
  ThemeIdSchema,
  ValidationError,
} from '@grindform/core';
import type { CustomExerciseId, DayId, PlanSessionId, SlotId } from '@grindform/core';

/** Parse `data` with `schema`, throwing a 400-mapped error on failure. */
export const parseOrThrow = <S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  what: string,
): z.output<S> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(`invalid ${what}`, { issues: result.error.issues });
  }
  return result.data;
};

/** A `day_…` path parameter. */
export const DayIdParamSchema = z
  .string()
  .refine(isDayId, { message: 'invalid DayId' })
  .transform((s): DayId => s as DayId);

/** A `slt_…` path parameter. */
export const SlotIdParamSchema = z
  .string()
  .refine(isSlotId, { message: 'invalid SlotId' })
  .transform((s): SlotId => s as SlotId);

/** A `pss_…` path/body parameter (a session within a plan day). */
export const PlanSessionIdSchema = z
  .string()
  .refine(isPlanSessionId, { message: 'invalid PlanSessionId' })
  .transform((s): PlanSessionId => s as PlanSessionId);

/** A `cex_…` path parameter (a user's custom exercise). */
export const CustomExerciseIdParamSchema = z
  .string()
  .refine(isCustomExerciseId, { message: 'invalid CustomExerciseId' })
  .transform((s): CustomExerciseId => s as CustomExerciseId);

/**
 * A reference to an exercise the user is swapping/adding — either a catalog
 * movement (by slug) or one of their own custom exercises (by id).
 */
export const ExerciseRefSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('catalog'), slug: ExerciseSlugSchema }),
  z.object({ source: z.literal('custom'), id: CustomExerciseIdParamSchema }),
]);
export type ExerciseRef = z.infer<typeof ExerciseRefSchema>;

/** Body for swapping a slot's exercise for another. */
export const SwapSlotBodySchema = z.object({ exercise: ExerciseRefSchema });

/** Body for adding an extra exercise to a day's training session. */
export const AddSlotBodySchema = z.object({
  sessionId: PlanSessionIdSchema,
  exercise: ExerciseRefSchema,
});

/** Body for creating/updating a custom exercise. */
export const CustomExerciseBodySchema = CustomExerciseInputSchema;

// ---------------------------------------------------------------------------
// Restore-day-sessions body (undo/redo). The client replays a prior
// snapshot of one day's sessions — a state the server itself produced — so
// the schema mirrors the planner's *output* shape and is validated strictly
// before it is persisted, exactly like any other network input.
// ---------------------------------------------------------------------------

const SupersetRefSnapshotSchema = z.object({
  group: z.string().min(1).max(8),
  order: z.number().int().min(1).max(12),
});

const ExerciseSlotSnapshotSchema = z.object({
  id: SlotIdParamSchema,
  exerciseSlug: ExerciseSlugSchema,
  name: z.string().min(1).max(120),
  scheme: RepSchemeSchema,
  primaryMuscles: z.array(MuscleGroupSchema).max(8),
  pyramid: z.boolean().optional(),
  superset: SupersetRefSnapshotSchema.optional(),
  cue: z.string().min(1).max(400).optional(),
});

const SessionBlockSnapshotSchema = z.object({
  type: BlockTypeSchema,
  title: z.string().min(1).max(80),
  estMinutes: z.number().int().min(0).max(600),
  slots: z.array(ExerciseSlotSnapshotSchema).max(40),
  note: z.string().min(1).max(400).optional(),
});

const TrainingSessionSnapshotSchema = z.object({
  id: PlanSessionIdSchema,
  kind: z.literal('training'),
  label: z.string().min(1).max(60).optional(),
  focus: z.array(MuscleGroupSchema).max(8),
  blocks: z.array(SessionBlockSnapshotSchema).max(12),
  estMinutes: z.number().int().min(0).max(600),
});

const ExternalSessionSnapshotSchema = z.object({
  id: PlanSessionIdSchema,
  kind: z.literal('external'),
  activity: ExternalActivitySchema,
  label: z.string().min(1).max(60).optional(),
  plannedMinutes: z.number().int().min(0).max(600),
  estMinutes: z.number().int().min(0).max(600),
});

const PlanSessionSnapshotSchema = z.discriminatedUnion('kind', [
  TrainingSessionSnapshotSchema,
  ExternalSessionSnapshotSchema,
]);

/**
 * Body for restoring a day's sessions to a prior snapshot (undo/redo). At
 * most four sessions per day, matching {@link DaySpecSchema}.
 */
export const RestoreDaySessionsBodySchema = z.object({
  sessions: z.array(PlanSessionSnapshotSchema).max(4),
});
export type RestoreDaySessionsBody = z.infer<typeof RestoreDaySessionsBodySchema>;

/** Query string for `GET /v1/exercises` (all filters optional). */
export const ExerciseQuerySchema = z.object({
  goal: GoalSchema.optional(),
  muscle: MuscleGroupSchema.optional(),
  primaryMuscle: MuscleGroupSchema.optional(),
  equipment: z.array(EquipmentSchema).optional(),
  role: ExerciseRoleSchema.optional(),
  pattern: MovementPatternSchema.optional(),
  experience: ExperienceSchema.optional(),
  unilateral: z.boolean().optional(),
});
export type ExerciseQuery = z.infer<typeof ExerciseQuerySchema>;

/** Body for marking a slot complete in one action. */
export const CompleteSlotBodySchema = z.object({
  loadKg: z.number().nonnegative().max(1000),
  reps: z.number().int().min(1).max(100).optional(),
  rpe: z.number().min(1).max(10).optional(),
});

/** Body for logging a single set. */
export const LogSetBodySchema = z.object({
  dayId: DayIdParamSchema,
  slotId: SlotIdParamSchema,
  exerciseSlug: ExerciseSlugSchema,
  setNumber: z.number().int().min(1).max(100),
  reps: z.number().int().min(1).max(100),
  loadKg: z.number().nonnegative().max(1000),
  rpe: z.number().min(1).max(10).optional(),
});

/** Max number of top-level keys and serialised bytes allowed in `preferences`. */
const MAX_PREFERENCE_KEYS = 50;
const MAX_PREFERENCE_BYTES = 4096;

/**
 * Body for updating settings. `preferences` is a free-form bag the client
 * owns, so it's bounded (key count + serialised size) to stop it being used
 * as unbounded per-user storage.
 */
export const SettingsBodySchema = z.object({
  theme: ThemeIdSchema,
  preferences: z
    .record(z.string(), z.unknown())
    .default({})
    .refine((p) => Object.keys(p).length <= MAX_PREFERENCE_KEYS, {
      message: `preferences may not exceed ${MAX_PREFERENCE_KEYS} keys`,
    })
    .refine((p) => JSON.stringify(p).length <= MAX_PREFERENCE_BYTES, {
      message: `preferences may not exceed ${MAX_PREFERENCE_BYTES} bytes`,
    }),
});
