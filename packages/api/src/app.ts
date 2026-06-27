/**
 * @file packages/api/src/app.ts
 *
 * The Hono application factory. `createApp({ db })` wires the catalog,
 * planner, db, and tracker behind a small JSON HTTP API under `/v1`.
 * It's a factory (not a singleton) so tests can pass a fresh PGlite db.
 *
 * Errors thrown by handlers — including the {@link GrindformError}
 * taxonomy from core — are funnelled through one `onError` hook that
 * renders the canonical `{ error: { code, message, details? } }` envelope.
 */

import { Hono } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import { filterExercises } from '@grindform/catalog';
import type { FilterCriteria } from '@grindform/catalog';
import {
  GeneratePlanInputSchema,
  isGrindformError,
  isPlanId,
  NotFoundError,
  parseUserId,
  toErrorPayload,
} from '@grindform/core';
import type { PlanId, UserId } from '@grindform/core';
import {
  createPlan,
  deletePlan,
  getPlan,
  getSettings,
  listPlanSummaries,
  upsertSettings,
} from '@grindform/db';
import type { Db, Settings } from '@grindform/db';
import { generatePlan } from '@grindform/planner';
import type { ExerciseSlot, PlanDay, WeeklyPlan } from '@grindform/planner';
import { getDayProgress, logCompletedSet, markSlotComplete } from '@grindform/tracker';

import {
  CompleteSlotBodySchema,
  DayIdParamSchema,
  ExerciseQuerySchema,
  LogSetBodySchema,
  parseOrThrow,
  SettingsBodySchema,
  SlotIdParamSchema,
} from './validation.ts';

/** Dependencies the app needs to run. */
export interface ApiDeps {
  readonly db: Db;
  /** The user everything is scoped to (single-user MVP uses a fixed id). */
  readonly userId?: UserId;
}

/** The fixed user id for the single-user MVP. */
export const SINGLE_USER_ID: UserId = parseUserId(`usr_${'0'.repeat(26)}`);

/** A `pln_…` path parameter schema. */
const PlanIdParamSchema = z
  .string()
  .refine(isPlanId, { message: 'invalid PlanId' })
  .transform((s): PlanId => s as PlanId);

/** Find a day within a plan by id. */
const findDay = (plan: WeeklyPlan, dayId: string): PlanDay | undefined =>
  plan.days.find((d) => d.id === dayId);

/** Find a slot within a day by id. */
const findSlot = (day: PlanDay, slotId: string): ExerciseSlot | undefined =>
  day.blocks.flatMap((b) => b.slots).find((s) => s.id === slotId);

/** Normalise the `GET /v1/exercises` query string into parseable shape. */
const readExerciseQuery = (queries: Record<string, string>): unknown => {
  const { equipment, unilateral, goal, muscle, primaryMuscle, role, pattern, experience } = queries;
  return {
    goal,
    muscle,
    primaryMuscle,
    equipment: equipment === undefined ? undefined : equipment.split(','),
    role,
    pattern,
    experience,
    unilateral: unilateral === undefined ? undefined : unilateral === 'true',
  };
};

/** Load a plan + day, throwing 404 if either is missing. */
const loadDay = async (
  db: Db,
  planIdRaw: string,
  dayIdRaw: string,
): Promise<{ plan: WeeklyPlan; day: PlanDay }> => {
  const planId = parseOrThrow(PlanIdParamSchema, planIdRaw, 'plan id');
  const dayId = parseOrThrow(DayIdParamSchema, dayIdRaw, 'day id');
  const plan = await getPlan(db, planId);
  if (plan === undefined) throw new NotFoundError('plan not found', { planId });
  const day = findDay(plan, dayId);
  if (day === undefined) throw new NotFoundError('day not found', { dayId });
  return { plan, day };
};

/** Project a settings row (or default) to its public shape. */
const serialiseSettings = (
  saved: Settings | undefined,
): { theme: string; preferences: Record<string, unknown> } =>
  saved === undefined
    ? { theme: 'grind', preferences: {} }
    : { theme: saved.theme, preferences: saved.preferences };

/** Build the Grindform HTTP API. */
export const createApp = (deps: ApiDeps): Hono => {
  const { db } = deps;
  const userId = deps.userId ?? SINGLE_USER_ID;
  const app = new Hono();

  app.get('/v1/health', (c) => c.json({ status: 'ok' }));

  app.get('/v1/exercises', (c) => {
    const query = parseOrThrow(
      ExerciseQuerySchema,
      readExerciseQuery(c.req.query()),
      'exercise query',
    );
    const criteria: FilterCriteria = {
      ...(query.goal === undefined ? {} : { goal: query.goal }),
      ...(query.muscle === undefined ? {} : { muscle: query.muscle }),
      ...(query.primaryMuscle === undefined ? {} : { primaryMuscle: query.primaryMuscle }),
      ...(query.equipment === undefined ? {} : { equipment: query.equipment }),
      ...(query.role === undefined ? {} : { role: query.role }),
      ...(query.pattern === undefined ? {} : { pattern: query.pattern }),
      ...(query.experience === undefined ? {} : { experience: query.experience }),
      ...(query.unilateral === undefined ? {} : { unilateral: query.unilateral }),
    };
    return c.json({ exercises: filterExercises(criteria) });
  });

  app.post('/v1/plans', async (c) => {
    const input = parseOrThrow(GeneratePlanInputSchema, await c.req.json(), 'plan input');
    const generated = generatePlan(input);
    if (!generated.ok) throw generated.error;
    await createPlan(db, userId, generated.value);
    return c.json({ plan: generated.value }, 201);
  });

  app.get('/v1/plans', async (c) => {
    const plans = await listPlanSummaries(db, userId);
    return c.json({ plans });
  });

  app.get('/v1/plans/:planId', async (c) => {
    const planId = parseOrThrow(PlanIdParamSchema, c.req.param('planId'), 'plan id');
    const plan = await getPlan(db, planId);
    if (plan === undefined) throw new NotFoundError('plan not found', { planId });
    return c.json({ plan });
  });

  app.delete('/v1/plans/:planId', async (c) => {
    const planId = parseOrThrow(PlanIdParamSchema, c.req.param('planId'), 'plan id');
    const removed = await deletePlan(db, planId);
    if (!removed) throw new NotFoundError('plan not found', { planId });
    return c.body(null, 204);
  });

  app.get('/v1/plans/:planId/days/:dayId/progress', async (c) => {
    const { day } = await loadDay(db, c.req.param('planId'), c.req.param('dayId'));
    return c.json({ progress: await getDayProgress(db, day) });
  });

  app.post('/v1/plans/:planId/days/:dayId/slots/:slotId/complete', async (c) => {
    const { day } = await loadDay(db, c.req.param('planId'), c.req.param('dayId'));
    const slotId = parseOrThrow(SlotIdParamSchema, c.req.param('slotId'), 'slot id');
    const slot = findSlot(day, slotId);
    if (slot === undefined) throw new NotFoundError('slot not found', { slotId });
    const body = parseOrThrow(CompleteSlotBodySchema, await c.req.json(), 'completion body');
    const logs = await markSlotComplete(db, {
      dayId: day.id,
      slot,
      loadKg: body.loadKg,
      ...(body.reps === undefined ? {} : { reps: body.reps }),
      ...(body.rpe === undefined ? {} : { rpe: body.rpe }),
    });
    return c.json({ logs, progress: await getDayProgress(db, day) }, 201);
  });

  app.post('/v1/logs', async (c) => {
    const body = parseOrThrow(LogSetBodySchema, await c.req.json(), 'log body');
    const log = await logCompletedSet(db, {
      dayId: body.dayId,
      slot: {
        id: body.slotId,
        exerciseSlug: body.exerciseSlug,
        name: body.exerciseSlug,
        scheme: {
          sets: 1,
          repsLow: body.reps,
          repsHigh: body.reps,
          restSeconds: 0,
          perSide: false,
        },
      },
      setNumber: body.setNumber,
      reps: body.reps,
      loadKg: body.loadKg,
      ...(body.rpe === undefined ? {} : { rpe: body.rpe }),
    });
    return c.json({ log }, 201);
  });

  app.get('/v1/settings', async (c) => {
    const saved = await getSettings(db, userId);
    return c.json({ settings: serialiseSettings(saved) });
  });

  app.patch('/v1/settings', async (c) => {
    const body = parseOrThrow(SettingsBodySchema, await c.req.json(), 'settings body');
    const saved = await upsertSettings(db, userId, {
      theme: body.theme,
      preferences: body.preferences,
    });
    return c.json({ settings: serialiseSettings(saved) });
  });

  app.onError((err, c) => {
    const status: StatusCode = isGrindformError(err) ? (err.httpStatus as StatusCode) : 500;
    return c.json({ error: toErrorPayload(err) }, status);
  });

  return app;
};
