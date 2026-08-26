import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GeneratePlanInputSchema, newUserId, newPlanId, isOk } from '@grindform/core';
import { generatePlan } from '@grindform/planner';
import type { WeeklyPlan } from '@grindform/planner';

import type { Db } from '../src/client.ts';
import {
  createPlan,
  clearDefaultPlan,
  dayBelongsToUser,
  deletePlan,
  getDayForUser,
  getPlan,
  getDefaultPlan,
  listPlanIdsForUser,
  listPlanSummaries,
  planBelongsToUser,
  setDefaultPlan,
  updateDaySessions,
} from '../src/repos/plans-repo.ts';
import { assignWeek, getWeekAssignment } from '../src/repos/weeks-repo.ts';
import { freshDb } from './helpers/db.ts';

const makePlan = (): WeeklyPlan => {
  const r = generatePlan(
    GeneratePlanInputSchema.parse({
      goal: 'recomp',
      days: [
        { weekday: 'mon', sessions: [{ kind: 'training', focus: ['glutes'], label: 'Glute day' }] },
        {
          weekday: 'tue',
          sessions: [
            { kind: 'external', activity: 'pilates', label: 'Reformer', plannedMinutes: 45 },
          ],
        },
        {
          weekday: 'wed',
          label: 'Pull + run',
          sessions: [
            { kind: 'training', focus: ['back'] },
            { kind: 'external', activity: 'run', plannedMinutes: 20 },
          ],
        },
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

  it('round-trips a plan with training, external, and multi-session days', async () => {
    const userId = newUserId();
    const plan = makePlan();
    await createPlan(db, userId, plan);

    const loaded = await getPlan(db, plan.id);
    expect(loaded).toBeDefined();
    expect(loaded?.goal).toBe('recomp');
    expect(loaded?.days).toHaveLength(3);
    // Day order preserved.
    expect(loaded?.days.map((d) => d.weekday)).toEqual(['mon', 'tue', 'wed']);
    // Monday is a single labelled training session with generated blocks.
    const mon = loaded?.days[0]?.sessions[0];
    expect(mon?.kind).toBe('training');
    if (mon?.kind === 'training') {
      expect(mon.label).toBe('Glute day');
      expect(mon.blocks.length).toBeGreaterThan(0);
      expect(mon.blocks.find((block) => block.type === 'warmup')?.recommendations).toBeDefined();
      expect(mon.blocks.find((block) => block.type === 'cooldown')?.recommendations).toBeDefined();
    }
    // Tuesday is an external Pilates session.
    const tue = loaded?.days[1]?.sessions[0];
    expect(tue?.kind).toBe('external');
    if (tue?.kind === 'external') {
      expect(tue.activity).toBe('pilates');
      expect(tue.label).toBe('Reformer');
    }
    // Wednesday holds two sessions (training + run), in order, and a day label.
    expect(loaded?.days[2]?.label).toBe('Pull + run');
    expect(loaded?.days[2]?.sessions).toHaveLength(2);
    expect(loaded?.days[2]?.sessions[0]?.kind).toBe('training');
    expect(loaded?.days[2]?.sessions[1]?.kind).toBe('external');
  });

  it('derives recommendations when older session JSON has none', async () => {
    const userId = newUserId();
    const plan = makePlan();
    await createPlan(db, userId, plan);
    const loaded = await getPlan(db, plan.id);
    const sessions = loaded!.days[0]!.sessions.map((session) =>
      session.kind === 'training'
        ? {
            ...session,
            blocks: session.blocks.map(({ recommendations: _old, ...block }) => block),
          }
        : session,
    );
    await updateDaySessions(db, loaded!.days[0]!.id, userId, sessions, loaded!.days[0]!.estMinutes);
    const old = await getPlan(db, plan.id);
    const training = old!.days[0]!.sessions[0];
    if (training?.kind === 'training') {
      expect(
        training.blocks.find((block) => block.type === 'warmup')?.recommendations,
      ).toBeDefined();
      expect(
        training.blocks.find((block) => block.type === 'cooldown')?.recommendations,
      ).toBeDefined();
    }
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

  it('deletes a plan owned by the user (cascading days) and reports success', async () => {
    const userId = newUserId();
    const plan = makePlan();
    await createPlan(db, userId, plan);
    expect(await deletePlan(db, plan.id, userId)).toBe(true);
    expect(await getPlan(db, plan.id)).toBeUndefined();
  });

  it('manages one default plan per user and cleans assignments on delete', async () => {
    const userId = newUserId();
    const first = makePlan();
    const second = makePlan();
    await createPlan(db, userId, first);
    await createPlan(db, userId, second);
    expect(await setDefaultPlan(db, userId, newPlanId())).toBe(false);
    expect(await setDefaultPlan(db, userId, first.id)).toBe(true);
    expect(await getDefaultPlan(db, userId)).toBe(first.id);
    expect(await setDefaultPlan(db, userId, second.id)).toBe(true);
    expect(await getDefaultPlan(db, userId)).toBe(second.id);
    expect((await listPlanSummaries(db, userId)).find((p) => p.id === second.id)?.isDefault).toBe(
      true,
    );
    expect(await clearDefaultPlan(db, userId, second.id)).toBe(true);
    expect(await clearDefaultPlan(db, userId, newPlanId())).toBe(false);
    expect(await getDefaultPlan(db, userId)).toBeUndefined();
    await assignWeek(db, userId, '2026-07-06', first.id);
    expect(await deletePlan(db, first.id, userId)).toBe(true);
    expect(await getWeekAssignment(db, userId, '2026-07-06')).toBeUndefined();
  });

  it('deletePlan returns false when nothing matched or the plan is another user’s', async () => {
    const owner = newUserId();
    const plan = makePlan();
    await createPlan(db, owner, plan);
    expect(await deletePlan(db, plan.id, newUserId())).toBe(false);
    expect(await deletePlan(db, newPlanId(), owner)).toBe(false);
  });

  it('planBelongsToUser and listPlanIdsForUser scope by owner', async () => {
    const owner = newUserId();
    const other = newUserId();
    const plan = makePlan();
    await createPlan(db, owner, plan);
    expect(await planBelongsToUser(db, plan.id, owner)).toBe(true);
    expect(await planBelongsToUser(db, plan.id, other)).toBe(false);
    expect(await listPlanIdsForUser(db, owner)).toEqual([plan.id]);
    expect(await listPlanIdsForUser(db, other)).toEqual([]);
  });

  it('dayBelongsToUser checks ownership through the plan', async () => {
    const owner = newUserId();
    const other = newUserId();
    const plan = makePlan();
    await createPlan(db, owner, plan);
    const dayId = plan.days[0]!.id;
    expect(await dayBelongsToUser(db, dayId, owner)).toBe(true);
    expect(await dayBelongsToUser(db, dayId, other)).toBe(false);
  });

  it('getDayForUser returns the owned day and undefined otherwise', async () => {
    const owner = newUserId();
    const other = newUserId();
    const plan = makePlan();
    await createPlan(db, owner, plan);
    const dayId = plan.days[0]!.id;
    const day = await getDayForUser(db, dayId, owner);
    expect(day?.id).toBe(dayId);
    expect(day?.weekday).toBe('mon');
    expect(day?.sessions[0]?.kind).toBe('training');
    // Another user can't load it, and an unknown day id yields undefined.
    expect(await getDayForUser(db, dayId, other)).toBeUndefined();
    expect(await getDayForUser(db, plan.days[2]!.id, other)).toBeUndefined();
  });

  it('updateDaySessions overwrites a day only for the owner', async () => {
    const owner = newUserId();
    const other = newUserId();
    const plan = makePlan();
    await createPlan(db, owner, plan);
    const dayId = plan.days[0]!.id;

    // A non-owner cannot update the day.
    expect(await updateDaySessions(db, dayId, other, [], 0)).toBe(false);

    // The owner can replace the sessions (here: empty it into a rest day).
    expect(await updateDaySessions(db, dayId, owner, [], 0)).toBe(true);
    const day = await getDayForUser(db, dayId, owner);
    expect(day?.sessions).toEqual([]);
    expect(day?.estMinutes).toBe(0);
  });
});
