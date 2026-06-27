import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GeneratePlanInputSchema, newUserId, newPlanId, isOk } from '@grindform/core';
import { generatePlan } from '@grindform/planner';
import type { WeeklyPlan } from '@grindform/planner';

import type { Db } from '../src/client.ts';
import { createPlan, deletePlan, getPlan, listPlanSummaries } from '../src/repos/plans-repo.ts';
import { freshDb } from './helpers/db.ts';

const makePlan = (): WeeklyPlan => {
  const r = generatePlan(
    GeneratePlanInputSchema.parse({
      goal: 'recomp',
      days: [
        { weekday: 'mon', focus: ['glutes'], label: 'Glute day' },
        { weekday: 'tue', activity: 'pilates', label: 'Reformer' },
        { weekday: 'wed', focus: ['back'] },
      ],
    }),
  );
  if (!isOk(r)) throw new Error('plan generation failed');
  return r.value;
};

describe('plans-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('round-trips a plan with training and blocked days', async () => {
    const userId = newUserId();
    const plan = makePlan();
    await createPlan(db, userId, plan);

    const loaded = await getPlan(db, plan.id);
    expect(loaded).toBeDefined();
    expect(loaded?.goal).toBe('recomp');
    expect(loaded?.days).toHaveLength(3);
    // Day order preserved.
    expect(loaded?.days.map((d) => d.weekday)).toEqual(['mon', 'tue', 'wed']);
    // Training day kept its label; blocked day kept activity + label.
    expect(loaded?.days[0]?.label).toBe('Glute day');
    expect(loaded?.days[1]?.activity).toBe('pilates');
    expect(loaded?.days[1]?.label).toBe('Reformer');
    // Day without label/activity omits both.
    expect(loaded?.days[2]?.label).toBeUndefined();
    expect(loaded?.days[2]?.activity).toBeUndefined();
    expect(loaded?.days[0]?.blocks.length).toBeGreaterThan(0);
  });

  it('getPlan returns undefined for an unknown id', async () => {
    expect(await getPlan(db, newPlanId())).toBeUndefined();
  });

  it('lists plan summaries newest-first', async () => {
    const userId = newUserId();
    const a = makePlan();
    await createPlan(db, userId, a);
    await new Promise((r) => setTimeout(r, 5));
    const b = makePlan();
    await createPlan(db, userId, b);

    const summaries = await listPlanSummaries(db, userId);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.id).toBe(b.id);
    expect(summaries[0]?.goal).toBe('recomp');
  });

  it('does not list another user’s plans', async () => {
    await createPlan(db, newUserId(), makePlan());
    expect(await listPlanSummaries(db, newUserId())).toHaveLength(0);
  });

  it('deletes a plan (cascading days) and reports success', async () => {
    const plan = makePlan();
    await createPlan(db, newUserId(), plan);
    expect(await deletePlan(db, plan.id)).toBe(true);
    expect(await getPlan(db, plan.id)).toBeUndefined();
  });

  it('deletePlan returns false when nothing matched', async () => {
    expect(await deletePlan(db, newPlanId())).toBe(false);
  });
});
