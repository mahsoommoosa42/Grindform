import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newProgramId, newUserId } from '@grindform/core';
import type { ProgramGenerationInput } from '@grindform/core';
import type { Db } from '../src/client.ts';
import {
  createProgram,
  deleteProgramFuture,
  deleteProgram,
  getProgram,
  listPrograms,
  updateProgramWeekCount,
} from '../src/repos/programs-repo.ts';
import { createPlan, getPlan, listPlanSummaries } from '../src/repos/plans-repo.ts';
import { assignWeek, listProgramAssignments } from '../src/repos/weeks-repo.ts';
import { generateProgram } from '@grindform/planner';
import { freshDb } from './helpers/db.ts';

const input: ProgramGenerationInput = {
  startWeek: '2026-07-06',
  weeks: 2,
  goal: 'recomp',
  experience: 'intermediate',
  equipment: ['barbell'],
  timeBudget: {
    sessionMinutes: 60,
    warmupMinutes: 8,
    cooldownMinutes: 5,
    physioMinutes: 0,
    physioPosition: 0,
  },
  days: [{ weekday: 'mon', sessions: [] }],
  variation: 'A',
  seed: 1,
};

describe('programs-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('creates, reads, lists, and deletes programs by owner', async () => {
    const userId = newUserId();
    const id = newProgramId();
    const created = await createProgram(db, userId, input, id);
    expect(created.id).toBe(id);
    expect((await getProgram(db, userId, id))?.input.seed).toBe(1);
    expect(await listPrograms(db, userId)).toHaveLength(1);
    expect(await getProgram(db, newUserId(), id)).toBeUndefined();
    expect(await deleteProgram(db, newUserId(), id)).toBe(false);
    expect(await deleteProgram(db, userId, id)).toBe(true);
    expect(await deleteProgram(db, userId, id)).toBe(false);
  });

  it('stores materialized training weeks and removes only future weeks', async () => {
    const userId = newUserId();
    const id = newProgramId();
    await createProgram(db, userId, input, id);
    const generated = generateProgram(input);
    const first = generated.weeks[0]!;
    const second = generated.weeks[1]!;
    if (first.plan === undefined || first.weekIndex === undefined)
      throw new Error('expected training week');
    await createPlan(db, userId, first.plan!, {
      programId: id,
      programWeekIndex: first.weekIndex,
      programKind: first.kind,
      programLoadIndex: first.loadIndex,
    });
    await createPlan(db, userId, second.plan!);
    await assignWeek(db, userId, first.weekStart, first.plan!.id, { programId: id });
    await assignWeek(db, userId, second.weekStart, null, { programId: id, kind: 'break' });
    expect((await listPrograms(db, userId))[0]?.weeks).toHaveLength(2);
    expect((await getPlan(db, first.plan.id))?.weekIndex).toBe(first.weekIndex);
    expect(
      (await listPlanSummaries(db, userId)).find((summary) => summary.id === first.plan?.id)
        ?.programId,
    ).toBe(id);
    expect(await updateProgramWeekCount(db, userId, id, 2)).toBe(true);
    await deleteProgramFuture(db, userId, id, second.weekStart);
    expect(await listProgramAssignments(db, userId, id)).toHaveLength(1);
    await deleteProgramFuture(db, userId, id, first.weekStart);
    expect(await listProgramAssignments(db, userId, id)).toHaveLength(0);
    expect(await updateProgramWeekCount(db, newUserId(), id, 1)).toBe(false);
  });
});
