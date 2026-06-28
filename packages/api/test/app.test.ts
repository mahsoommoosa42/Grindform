import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import type { AppEnv } from '../src/context.ts';
import { freshApp, registerClient } from './helpers/db.ts';
import type { Client } from './helpers/db.ts';

interface PlanResponse {
  plan: {
    id: string;
    days: { id: string; blocks: { slots: { id: string }[] }[] }[];
  };
}

const samplePlanInput = {
  goal: 'build_muscle',
  days: [{ weekday: 'mon', focus: ['glutes', 'back'] }],
};

const createSamplePlan = async (client: Client): Promise<PlanResponse['plan']> => {
  const res = await client.json('/v1/plans', 'POST', samplePlanInput);
  expect(res.status).toBe(201);
  return ((await res.json()) as PlanResponse).plan;
};

const firstSlotId = (plan: PlanResponse['plan']): string => {
  for (const day of plan.days) {
    for (const block of day.blocks) {
      const slot = block.slots[0];
      if (slot !== undefined) return slot.id;
    }
  }
  throw new Error('no slot in plan');
};

describe('Grindform API', () => {
  let app: Hono<AppEnv>;
  let client: Client;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ app, dispose } = await freshApp());
    client = await registerClient(app);
  });
  afterEach(async () => {
    await dispose();
  });

  describe('GET /v1/health', () => {
    it('returns ok (no auth required)', async () => {
      const res = await app.request('/v1/health');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });

  describe('GET /v1/exercises', () => {
    it('returns the whole library with no filters (no auth required)', async () => {
      const res = await app.request('/v1/exercises');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { exercises: unknown[] };
      expect(body.exercises.length).toBeGreaterThan(20);
    });

    it('applies every filter, including equipment list and unilateral=true', async () => {
      const res = await app.request(
        '/v1/exercises?goal=build_muscle&muscle=glutes&primaryMuscle=glutes' +
          '&equipment=barbell,dumbbell&role=main&pattern=hinge&experience=intermediate&unilateral=false',
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { exercises: { unilateral: boolean }[] };
      expect(body.exercises.every((e) => e.unilateral === false)).toBe(true);
    });

    it('filters unilateral=true', async () => {
      const res = await app.request('/v1/exercises?unilateral=true');
      const body = (await res.json()) as { exercises: { unilateral: boolean }[] };
      expect(body.exercises.every((e) => e.unilateral === true)).toBe(true);
    });

    it('rejects an invalid filter value with 400', async () => {
      const res = await app.request('/v1/exercises?goal=not_a_goal');
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION');
    });
  });

  describe('auth guard', () => {
    it('rejects an unauthenticated resource request with 401', async () => {
      const res = await app.request('/v1/plans');
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a request bearing an unknown session cookie with 401', async () => {
      const res = await app.request('/v1/plans', { headers: { cookie: 'gf_session=bogus' } });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /v1/plans', () => {
    it('generates and persists a plan', async () => {
      const plan = await createSamplePlan(client);
      expect(plan.id.startsWith('pln_')).toBe(true);
      expect(plan.days).toHaveLength(1);
    });

    it('rejects an invalid body with 400', async () => {
      const res = await client.json('/v1/plans', 'POST', { goal: 'nope', days: [] });
      expect(res.status).toBe(400);
    });

    it('returns 400 when constraints make a day unfillable', async () => {
      const res = await client.json('/v1/plans', 'POST', {
        goal: 'build_muscle',
        equipment: ['band'],
        days: [{ weekday: 'mon', focus: ['quads'] }],
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION');
    });

    it('returns 500 on malformed JSON', async () => {
      const res = await client.request('/v1/plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ not valid json',
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('INTERNAL');
    });
  });

  describe('GET /v1/plans and /v1/plans/:planId', () => {
    it('lists and fetches a plan', async () => {
      const plan = await createSamplePlan(client);

      const list = await client.request('/v1/plans');
      const listBody = (await list.json()) as { plans: { id: string }[] };
      expect(listBody.plans.some((p) => p.id === plan.id)).toBe(true);

      const fetched = await client.request(`/v1/plans/${plan.id}`);
      expect(fetched.status).toBe(200);
    });

    it('returns 404 for an unknown (but valid) plan id', async () => {
      const res = await client.request(`/v1/plans/pln_${'0'.repeat(26)}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed plan id', async () => {
      const res = await client.request('/v1/plans/not-an-id');
      expect(res.status).toBe(400);
    });

    it('hides another user’s plan as 404', async () => {
      const plan = await createSamplePlan(client);
      const other = await registerClient(app, 'other@example.com');
      expect((await other.request(`/v1/plans/${plan.id}`)).status).toBe(404);
      expect((await other.request(`/v1/plans/${plan.id}`, { method: 'DELETE' })).status).toBe(404);
      expect(
        (await other.request(`/v1/plans/${plan.id}/days/${plan.days[0]!.id}/progress`)).status,
      ).toBe(404);
    });
  });

  describe('DELETE /v1/plans/:planId', () => {
    it('deletes an existing plan', async () => {
      const plan = await createSamplePlan(client);
      const res = await client.request(`/v1/plans/${plan.id}`, { method: 'DELETE' });
      expect(res.status).toBe(204);
      expect((await client.request(`/v1/plans/${plan.id}`)).status).toBe(404);
    });

    it('returns 404 when deleting an unknown plan', async () => {
      const res = await client.request(`/v1/plans/pln_${'0'.repeat(26)}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('progress + completion', () => {
    it('marks a slot complete (with reps + rpe) and reports progress', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slotId = firstSlotId(plan);

      const res = await client.json(
        `/v1/plans/${plan.id}/days/${dayId}/slots/${slotId}/complete`,
        'POST',
        { loadKg: 60, reps: 8, rpe: 8 },
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { logs: unknown[]; progress: { completeSlots: number } };
      expect(body.logs.length).toBeGreaterThan(0);
      expect(body.progress.completeSlots).toBeGreaterThan(0);

      const progress = await client.request(`/v1/plans/${plan.id}/days/${dayId}/progress`);
      expect(progress.status).toBe(200);
    });

    it('marks a slot complete with only loadKg (defaults applied)', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slotId = firstSlotId(plan);
      const res = await client.json(
        `/v1/plans/${plan.id}/days/${dayId}/slots/${slotId}/complete`,
        'POST',
        { loadKg: 50 },
      );
      expect(res.status).toBe(201);
    });

    it('returns 404 completing a slot that is not in the day', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const res = await client.json(
        `/v1/plans/${plan.id}/days/${dayId}/slots/slt_${'0'.repeat(26)}/complete`,
        'POST',
        { loadKg: 50 },
      );
      expect(res.status).toBe(404);
    });

    it('returns 400 completing a slot with an invalid body', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slotId = firstSlotId(plan);
      const res = await client.json(
        `/v1/plans/${plan.id}/days/${dayId}/slots/${slotId}/complete`,
        'POST',
        { loadKg: -5 },
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 progress for an unknown plan', async () => {
      const res = await client.request(
        `/v1/plans/pln_${'0'.repeat(26)}/days/day_${'0'.repeat(26)}/progress`,
      );
      expect(res.status).toBe(404);
    });

    it('returns 404 progress for a day not in the plan', async () => {
      const plan = await createSamplePlan(client);
      const res = await client.request(`/v1/plans/${plan.id}/days/day_${'0'.repeat(26)}/progress`);
      expect(res.status).toBe(404);
    });

    it('returns 400 progress for a malformed day id', async () => {
      const plan = await createSamplePlan(client);
      const res = await client.request(`/v1/plans/${plan.id}/days/nope/progress`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/logs', () => {
    it('logs a single set with RPE', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slotId = firstSlotId(plan);
      const res = await client.json('/v1/logs', 'POST', {
        dayId,
        slotId,
        exerciseSlug: 'back-squat',
        setNumber: 1,
        reps: 5,
        loadKg: 80,
        rpe: 9,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { log: { rpe: number } };
      expect(body.log.rpe).toBe(9);
    });

    it('logs a single set without RPE', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slotId = firstSlotId(plan);
      const res = await client.json('/v1/logs', 'POST', {
        dayId,
        slotId,
        exerciseSlug: 'back-squat',
        setNumber: 1,
        reps: 5,
        loadKg: 80,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { log: { rpe: number | null } };
      expect(body.log.rpe).toBeNull();
    });

    it('rejects an invalid log body with 400', async () => {
      const res = await client.json('/v1/logs', 'POST', { dayId: 'nope' });
      expect(res.status).toBe(400);
    });

    it('returns 404 logging against a day that is not the user’s', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slotId = firstSlotId(plan);
      const other = await registerClient(app, 'other@example.com');
      const res = await other.json('/v1/logs', 'POST', {
        dayId,
        slotId,
        exerciseSlug: 'back-squat',
        setNumber: 1,
        reps: 5,
        loadKg: 80,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('settings', () => {
    it('returns defaults before any settings are saved', async () => {
      const res = await client.request('/v1/settings');
      expect(res.status).toBe(200);
      const body = (await res.json()) as { settings: { theme: string } };
      expect(body.settings.theme).toBe('pulse');
    });

    it('updates and reads back settings', async () => {
      const patch = await client.json('/v1/settings', 'PATCH', {
        theme: 'girlypop',
        preferences: { units: 'kg' },
      });
      expect(patch.status).toBe(200);
      const patchBody = (await patch.json()) as { settings: { theme: string } };
      expect(patchBody.settings.theme).toBe('girlypop');

      const get = await client.request('/v1/settings');
      const getBody = (await get.json()) as {
        settings: { theme: string; preferences: Record<string, unknown> };
      };
      expect(getBody.settings.theme).toBe('girlypop');
      expect(getBody.settings.preferences).toEqual({ units: 'kg' });
    });

    it('rejects an invalid theme with 400', async () => {
      const res = await client.json('/v1/settings', 'PATCH', { theme: 'neon' });
      expect(res.status).toBe(400);
    });
  });
});
