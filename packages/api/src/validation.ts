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
  EquipmentSchema,
  ExerciseRoleSchema,
  ExerciseSlugSchema,
  ExperienceSchema,
  GoalSchema,
  isDayId,
  isSlotId,
  MovementPatternSchema,
  MuscleGroupSchema,
  ThemeIdSchema,
  ValidationError,
} from '@grindform/core';
import type { DayId, SlotId } from '@grindform/core';

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
