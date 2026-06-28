/**
 * @file packages/api/src/app.ts
 *
 * The Hono application factory. `createApp({ db })` wires the catalog,
 * planner, db, tracker, and auth behind a small JSON HTTP API under
 * `/v1`. It's a factory (not a singleton) so tests can pass a fresh
 * PGlite db and their own clock/admin allowlist.
 *
 * The app is multi-user: `/v1/health` and `/v1/exercises` are public,
 * but every plan/tracker/settings route requires a live session (via
 * {@link requireAuth}) and is scoped to that account. Ownership is
 * re-checked on every plan/day lookup so one user can never read or
 * mutate another's data by guessing ids.
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
  toErrorPayload,
} from '@grindform/core';
import type { PlanId, UserId } from '@grindform/core';
import {
  createPlan,
  dayBelongsToUser,
  deletePlan,
  getPlan,
  getSettings,
  listPlanSummaries,
  planBelongsToUser,
  upsertSettings,
} from '@grindform/db';
import type { Db, Settings } from '@grindform/db';
import { generatePlan } from '@grindform/planner';
import type { ExerciseSlot, PlanDay, WeeklyPlan } from '@grindform/planner';
import { getDayProgress, logCompletedSet, markSlotComplete } from '@grindform/tracker';

import { registerAdminRoutes } from './admin-routes.ts';
import { registerAuthRoutes } from './auth-routes.ts';
import { requireAuth } from './context.ts';
import type { AppEnv } from './context.ts';
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
  /** Emails granted the admin role on registration. Defaults to none. */
  readonly adminEmails?: ReadonlySet<string>;
  /** Whether session cookies carry the `Secure` attribute. Defaults to `true`. */
  readonly secureCookies?: boolean;
  /** Injectable clock, for deterministic tests. Defaults to `() => new Date()`. */
  readonly now?: () => Date;
  /** Per-IP attempt cap for register/login. Defaults to 20 per 15 minutes. */
  readonly authRateLimit?: { readonly limit: number; readonly windowMs: number };
}

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

/**
 * Load a plan + day owned by `userId`, throwing 404 if the plan is
 * missing, not theirs, or has no such day. "Not yours" is reported as
 * "not found" so ids can't be probed for existence.
 */
const loadDay = async (
  db: Db,
  userId: UserId,
  planIdRaw: string,
  dayIdRaw: string,
): Promise<{ plan: WeeklyPlan; day: PlanDay }> => {
  const planId = parseOrThrow(PlanIdParamSchema, planIdRaw, 'plan id');
  const dayId = parseOrThrow(DayIdParamSchema, dayIdRaw, 'day id');
  const plan = await getPlan(db, planId);
  if (plan === undefined) throw new NotFoundError('plan not found', { planId });
  if (!(await planBelongsToUser(db, planId, userId))) {
    throw new NotFoundError('plan not found', { planId });
  }
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
export const createApp = (deps: ApiDeps): Hono<AppEnv> => {
  const { db } = deps;
  const now = deps.now ?? ((): Date => new Date());
  const adminEmails = deps.adminEmails ?? new Set<string>();
  const secureCookies = deps.secureCookies ?? true;
  const app = new Hono<AppEnv>();
  const guard = requireAuth(db, now);

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

  registerAuthRoutes(app, {
    db,
    adminEmails,
    secureCookies,
    now,
    ...(deps.authRateLimit === undefined ? {} : { authRateLimit: deps.authRateLimit }),
  });
  registerAdminRoutes(app, { db, now });

  app.post('/v1/plans', guard, async (c) => {
    const input = parseOrThrow(GeneratePlanInputSchema, await c.req.json(), 'plan input');
    const generated = generatePlan(input);
    if (!generated.ok) throw generated.error;
    await createPlan(db, c.get('auth').userId, generated.value);
    return c.json({ plan: generated.value }, 201);
  });

  app.get('/v1/plans', guard, async (c) => {
    const plans = await listPlanSummaries(db, c.get('auth').userId);
    return c.json({ plans });
  });

  app.get('/v1/plans/:planId', guard, async (c) => {
    const planId = parseOrThrow(PlanIdParamSchema, c.req.param('planId'), 'plan id');
    const plan = await getPlan(db, planId);
    if (plan === undefined) throw new NotFoundError('plan not found', { planId });
    if (!(await planBelongsToUser(db, planId, c.get('auth').userId))) {
      throw new NotFoundError('plan not found', { planId });
    }
    return c.json({ plan });
  });

  app.delete('/v1/plans/:planId', guard, async (c) => {
    const planId = parseOrThrow(PlanIdParamSchema, c.req.param('planId'), 'plan id');
    const removed = await deletePlan(db, planId, c.get('auth').userId);
    if (!removed) throw new NotFoundError('plan not found', { planId });
    return c.body(null, 204);
  });

  app.get('/v1/plans/:planId/days/:dayId/progress', guard, async (c) => {
    const { day } = await loadDay(
      db,
      c.get('auth').userId,
      c.req.param('planId'),
      c.req.param('dayId'),
    );
    return c.json({ progress: await getDayProgress(db, day) });
  });

  app.post('/v1/plans/:planId/days/:dayId/slots/:slotId/complete', guard, async (c) => {
    const { day } = await loadDay(
      db,
      c.get('auth').userId,
      c.req.param('planId'),
      c.req.param('dayId'),
    );
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

  app.post('/v1/logs', guard, async (c) => {
    const body = parseOrThrow(LogSetBodySchema, await c.req.json(), 'log body');
    if (!(await dayBelongsToUser(db, body.dayId, c.get('auth').userId))) {
      throw new NotFoundError('day not found', { dayId: body.dayId });
    }
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

  app.get('/v1/settings', guard, async (c) => {
    const saved = await getSettings(db, c.get('auth').userId);
    return c.json({ settings: serialiseSettings(saved) });
  });

  app.patch('/v1/settings', guard, async (c) => {
    const body = parseOrThrow(SettingsBodySchema, await c.req.json(), 'settings body');
    const saved = await upsertSettings(db, c.get('auth').userId, {
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
