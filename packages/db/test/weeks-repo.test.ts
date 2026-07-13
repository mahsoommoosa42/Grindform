import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newPlanId, newUserId } from '@grindform/core';
import type { Db } from '../src/client.ts';
import {
  assignWeek,
  getWeekAssignment,
  listWeekAssignments,
  unassignWeek,
} from '../src/repos/weeks-repo.ts';
import { freshDb } from './helpers/db.ts';

describe('weeks-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('upserts, reads, lists, and unassigns week assignments', async () => {
    const userId = newUserId();
    const first = newPlanId();
    const second = newPlanId();
    await assignWeek(db, userId, '2026-07-06', first);
    const replaced = await assignWeek(db, userId, '2026-07-06', second);
    expect(replaced.planId).toBe(second);
    await assignWeek(db, userId, '2026-07-13', first);
    expect((await getWeekAssignment(db, userId, '2026-07-06'))?.planId).toBe(second);
    expect(await listWeekAssignments(db, userId, '2026-07-06', '2026-07-13')).toHaveLength(2);
    expect(await unassignWeek(db, userId, '2026-07-06')).toBe(true);
    expect(await unassignWeek(db, userId, '2026-07-06')).toBe(false);
    expect(await getWeekAssignment(db, userId, '2026-07-06')).toBeUndefined();
  });

  it('scopes assignments by user and range', async () => {
    const owner = newUserId();
    await assignWeek(db, owner, '2026-07-06', newPlanId());
    expect(await listWeekAssignments(db, newUserId(), '2026-07-06', '2026-07-13')).toEqual([]);
    expect(await listWeekAssignments(db, owner, '2026-07-13', '2026-07-20')).toEqual([]);
  });
});
