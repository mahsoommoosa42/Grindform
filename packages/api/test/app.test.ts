import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import type { AppEnv } from '../src/context.ts';
import { freshApp, registerClient } from './helpers/db.ts';
import type { Client } from './helpers/db.ts';

interface PlanResponse {
  plan: {
    id: string;
    days: {
      id: string;
      sessions: { kind: string; blocks?: { slots: { id: string; exerciseSlug: string }[] }[] }[];
    }[];
  };
}

const samplePlanInput = {
  goal: 'build_muscle',
  days: [
    {
      weekday: 'mon',
      // A training session plus an external run, so slot lookups must skip
      // external sessions when searching for an exercise slot.
      sessions: [
        { kind: 'training', focus: ['glutes', 'back'] },
        { kind: 'external', activity: 'run', plannedMinutes: 20 },
      ],
    },
  ],
};

const createSamplePlan = async (client: Client): Promise<PlanResponse['plan']> => {
  const res = await client.json('/v1/plans', 'POST', samplePlanInput);
  expect(res.status).toBe(201);
  return ((await res.json()) as PlanResponse).plan;
};

const firstSlot = (plan: PlanResponse['plan']): { id: string; exerciseSlug: string } => {
  for (const day of plan.days) {
    for (const session of day.sessions) {
      for (const block of session.blocks ?? []) {
        const slot = block.slots[0];
        if (slot !== undefined) return { id: slot.id, exerciseSlug: slot.exerciseSlug };
      }
    }
  }
  throw new Error('no slot in plan');
};

const firstSlotId = (plan: PlanResponse['plan']): string => firstSlot(plan).id;

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
        days: [{ weekday: 'mon', sessions: [{ kind: 'training', focus: ['quads'] }] }],
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
      const progressBody = (await progress.json()) as { volume: { totalKg: number } };
      // 8 reps × 60 kg over the slot's prescribed sets → positive tonnage.
      expect(progressBody.volume.totalKg).toBeGreaterThan(0);
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

  describe('GET /v1/plans/:planId/volume', () => {
    it('reports the whole-week volume after logging sets', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slotId = firstSlotId(plan);
      await client.json(`/v1/plans/${plan.id}/days/${dayId}/slots/${slotId}/complete`, 'POST', {
        loadKg: 80,
        reps: 5,
      });
      const res = await client.request(`/v1/plans/${plan.id}/volume`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        volume: { totalKg: number; perMuscle: { muscle: string; kg: number }[] };
      };
      expect(body.volume.totalKg).toBeGreaterThan(0);
      expect(body.volume.perMuscle.length).toBeGreaterThan(0);
    });

    it('returns 404 week volume for an unknown plan', async () => {
      const res = await client.request(`/v1/plans/pln_${'0'.repeat(26)}/volume`);
      expect(res.status).toBe(404);
    });

    it("returns 404 week volume for another user's plan", async () => {
      const plan = await createSamplePlan(client);
      const other = await registerClient(app, 'volume-other@example.com');
      const res = await other.request(`/v1/plans/${plan.id}/volume`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/logs', () => {
    it('logs a single set with RPE', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slot = firstSlot(plan);
      const res = await client.json('/v1/logs', 'POST', {
        dayId,
        slotId: slot.id,
        exerciseSlug: slot.exerciseSlug,
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
      const slot = firstSlot(plan);
      const res = await client.json('/v1/logs', 'POST', {
        dayId,
        slotId: slot.id,
        exerciseSlug: slot.exerciseSlug,
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

    it('returns 404 logging a slot that is not in the day', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const res = await client.json('/v1/logs', 'POST', {
        dayId,
        slotId: `slt_${'0'.repeat(26)}`,
        exerciseSlug: 'back-squat',
        setNumber: 1,
        reps: 5,
        loadKg: 80,
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 when the exercise does not match the slot', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slot = firstSlot(plan);
      const wrong = slot.exerciseSlug === 'back-squat' ? 'front-squat' : 'back-squat';
      const res = await client.json('/v1/logs', 'POST', {
        dayId,
        slotId: slot.id,
        exerciseSlug: wrong,
        setNumber: 1,
        reps: 5,
        loadKg: 80,
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 logging against a day that is not the user’s', async () => {
      const plan = await createSamplePlan(client);
      const dayId = plan.days[0]?.id ?? '';
      const slot = firstSlot(plan);
      const other = await registerClient(app, 'other@example.com');
      const res = await other.json('/v1/logs', 'POST', {
        dayId,
        slotId: slot.id,
        exerciseSlug: slot.exerciseSlug,
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

interface FullPlan {
  id: string;
  goal: string;
  days: {
    id: string;
    sessions: {
      id: string;
      kind: string;
      blocks?: { type: string; slots: { id: string; exerciseSlug: string; name: string }[] }[];
    }[];
  }[];
}

interface CustomExerciseResponse {
  exercise: { id: string; name: string; role: string };
}

const validCustom = {
  name: 'Banded glute bridge',
  primaryMuscles: ['glutes'],
  secondaryMuscles: ['hamstrings'],
  equipment: ['band'],
  role: 'accessory',
  unilateral: false,
  cue: 'Drive through the heels.',
};

const planWith = {
  goal: 'build_muscle',
  days: [
    {
      weekday: 'mon',
      sessions: [
        { kind: 'training', focus: ['glutes', 'back'] },
        { kind: 'external', activity: 'run', plannedMinutes: 20 },
      ],
    },
  ],
};

const makePlan = async (client: Client): Promise<FullPlan> => {
  const res = await client.json('/v1/plans', 'POST', planWith);
  expect(res.status).toBe(201);
  return ((await res.json()) as { plan: FullPlan }).plan;
};

const trainingSession = (plan: FullPlan): FullPlan['days'][number]['sessions'][number] => {
  const session = plan.days[0]!.sessions.find((s) => s.kind === 'training');
  if (session === undefined) throw new Error('no training session');
  return session;
};

const externalSession = (plan: FullPlan): FullPlan['days'][number]['sessions'][number] => {
  const session = plan.days[0]!.sessions.find((s) => s.kind === 'external');
  if (session === undefined) throw new Error('no external session');
  return session;
};

const aSlot = (plan: FullPlan): { id: string; exerciseSlug: string } => {
  const slot = trainingSession(plan).blocks?.flatMap((b) => b.slots)[0];
  if (slot === undefined) throw new Error('no slot');
  return slot;
};

const allSlugs = (plan: FullPlan): string[] =>
  trainingSession(plan).blocks?.flatMap((b) => b.slots.map((s) => s.exerciseSlug)) ?? [];

describe('Custom exercises', () => {
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

  it('creates, lists, and deletes a custom exercise (scoped to the account)', async () => {
    const created = await client.json('/v1/exercises/custom', 'POST', validCustom);
    expect(created.status).toBe(201);
    const { exercise } = (await created.json()) as CustomExerciseResponse;
    expect(exercise.id.startsWith('cex_')).toBe(true);

    const list = await client.request('/v1/exercises/custom');
    const body = (await list.json()) as { exercises: { id: string }[] };
    expect(body.exercises.map((e) => e.id)).toEqual([exercise.id]);

    // A second account cannot see it.
    const other = await registerClient(app, 'other@example.com');
    const otherList = await other.request('/v1/exercises/custom');
    expect(((await otherList.json()) as { exercises: unknown[] }).exercises).toEqual([]);

    // Deleting another account's exercise reports 404; the owner's delete works.
    expect((await other.json(`/v1/exercises/custom/${exercise.id}`, 'DELETE', {})).status).toBe(404);
    const del = await client.json(`/v1/exercises/custom/${exercise.id}`, 'DELETE', {});
    expect(del.status).toBe(204);
    const afterList = await client.request('/v1/exercises/custom');
    expect(((await afterList.json()) as { exercises: unknown[] }).exercises).toEqual([]);
  });

  it('rejects an invalid custom-exercise body with 400', async () => {
    const res = await client.json('/v1/exercises/custom', 'POST', { name: '' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed custom-exercise id with 400', async () => {
    const res = await client.json('/v1/exercises/custom/not-an-id', 'DELETE', {});
    expect(res.status).toBe(400);
  });
});

describe('Plan slot edits (swap / add / remove)', () => {
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

  it('swaps a slot for a catalog exercise, preserving the slot id', async () => {
    const plan = await makePlan(client);
    const slot = aSlot(plan);
    const res = await client.json(
      `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots/${slot.id}/swap`,
      'PUT',
      { exercise: { source: 'catalog', slug: 'barbell-hip-thrust' } },
    );
    expect(res.status).toBe(200);
    const updated = ((await res.json()) as { plan: FullPlan }).plan;
    const swapped = trainingSession(updated)
      .blocks?.flatMap((b) => b.slots)
      .find((s) => s.id === slot.id);
    expect(swapped?.exerciseSlug).toBe('barbell-hip-thrust');
  });

  it('swaps a slot for a custom exercise (synthetic custom- slug)', async () => {
    const plan = await makePlan(client);
    const slot = aSlot(plan);
    const { exercise } = (await (
      await client.json('/v1/exercises/custom', 'POST', validCustom)
    ).json()) as CustomExerciseResponse;
    const res = await client.json(
      `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots/${slot.id}/swap`,
      'PUT',
      { exercise: { source: 'custom', id: exercise.id } },
    );
    expect(res.status).toBe(200);
    const updated = ((await res.json()) as { plan: FullPlan }).plan;
    const swapped = trainingSession(updated)
      .blocks?.flatMap((b) => b.slots)
      .find((s) => s.id === slot.id);
    expect(swapped?.exerciseSlug.startsWith('custom-')).toBe(true);
    expect(swapped?.name).toBe('Banded glute bridge');
  });

  it('swaps to cue-less catalog and custom exercises (cue omitted)', async () => {
    const plan = await makePlan(client);
    const slot = aSlot(plan);
    const base = `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots/${slot.id}/swap`;
    // A catalog movement with no cue.
    expect(
      (await client.json(base, 'PUT', { exercise: { source: 'catalog', slug: 'conventional-deadlift' } }))
        .status,
    ).toBe(200);
    // A custom exercise created without a cue.
    const { exercise } = (await (
      await client.json('/v1/exercises/custom', 'POST', {
        name: 'No-cue move',
        primaryMuscles: ['glutes'],
        equipment: ['bodyweight'],
        role: 'accessory',
        unilateral: false,
      })
    ).json()) as CustomExerciseResponse;
    expect(
      (await client.json(base, 'PUT', { exercise: { source: 'custom', id: exercise.id } })).status,
    ).toBe(200);
  });

  it('404s swapping with an unknown catalog slug or custom id', async () => {
    const plan = await makePlan(client);
    const slot = aSlot(plan);
    const base = `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots/${slot.id}/swap`;
    const noCatalog = await client.json(base, 'PUT', {
      exercise: { source: 'catalog', slug: 'no-such-exercise' },
    });
    expect(noCatalog.status).toBe(404);
    const noCustom = await client.json(base, 'PUT', {
      exercise: { source: 'custom', id: `cex_${'0'.repeat(26)}` },
    });
    expect(noCustom.status).toBe(404);
  });

  it('404s swapping a slot that does not exist', async () => {
    const plan = await makePlan(client);
    const res = await client.json(
      `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots/slt_${'0'.repeat(26)}/swap`,
      'PUT',
      { exercise: { source: 'catalog', slug: 'barbell-hip-thrust' } },
    );
    expect(res.status).toBe(404);
  });

  it('adds an exercise to a training session', async () => {
    const plan = await makePlan(client);
    const before = allSlugs(plan).length;
    const res = await client.json(`/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots`, 'POST', {
      sessionId: trainingSession(plan).id,
      exercise: { source: 'catalog', slug: 'barbell-hip-thrust' },
    });
    expect(res.status).toBe(201);
    const updated = ((await res.json()) as { plan: FullPlan }).plan;
    expect(allSlugs(updated)).toContain('barbell-hip-thrust');
    expect(allSlugs(updated).length).toBe(before + 1);
  });

  it('404s adding to a non-training (external) or unknown session', async () => {
    const plan = await makePlan(client);
    const base = `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots`;
    const external = await client.json(base, 'POST', {
      sessionId: externalSession(plan).id,
      exercise: { source: 'catalog', slug: 'barbell-hip-thrust' },
    });
    expect(external.status).toBe(404);
    const unknown = await client.json(base, 'POST', {
      sessionId: `pss_${'0'.repeat(26)}`,
      exercise: { source: 'catalog', slug: 'barbell-hip-thrust' },
    });
    expect(unknown.status).toBe(404);
  });

  it('removes a slot, and 404s removing one that is gone', async () => {
    const plan = await makePlan(client);
    const slot = aSlot(plan);
    const path = `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots/${slot.id}`;
    const res = await client.json(path, 'DELETE', {});
    expect(res.status).toBe(200);
    const updated = ((await res.json()) as { plan: FullPlan }).plan;
    expect(allSlugs(updated)).not.toContain(slot.exerciseSlug);
    // Removing it again now 404s.
    expect((await client.json(path, 'DELETE', {})).status).toBe(404);
  });

  it('404s slot edits on a plan the caller does not own', async () => {
    const plan = await makePlan(client);
    const slot = aSlot(plan);
    const other = await registerClient(app, 'mallory@example.com');
    const res = await other.json(
      `/v1/plans/${plan.id}/days/${plan.days[0]!.id}/slots/${slot.id}`,
      'DELETE',
      {},
    );
    expect(res.status).toBe(404);
  });

  it('404s slot edits on an unknown day', async () => {
    const plan = await makePlan(client);
    const res = await client.json(
      `/v1/plans/${plan.id}/days/day_${'0'.repeat(26)}/slots`,
      'POST',
      {
        sessionId: trainingSession(plan).id,
        exercise: { source: 'catalog', slug: 'barbell-hip-thrust' },
      },
    );
    expect(res.status).toBe(404);
  });
});
