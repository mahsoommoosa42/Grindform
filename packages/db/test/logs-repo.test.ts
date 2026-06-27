import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newDayId, newLogId, newSlotId, parseExerciseSlug } from '@grindform/core';

import type { Db } from '../src/client.ts';
import {
  deleteLog,
  listLogsForDay,
  listLogsForExercise,
  logSet,
} from '../src/repos/logs-repo.ts';
import { freshDb } from './helpers/db.ts';

const slug = parseExerciseSlug('back-squat');

describe('logs-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('logs a set with RPE and an explicit timestamp', async () => {
    const dayId = newDayId();
    const stored = await logSet(db, {
      id: newLogId(),
      dayId,
      slotId: newSlotId(),
      exerciseSlug: slug,
      setNumber: 1,
      reps: 8,
      loadKg: 60,
      rpe: 7.5,
      completedAt: new Date('2026-01-01T10:00:00Z'),
    });
    expect(stored.rpe).toBe(7.5);
    expect(stored.loadKg).toBe(60);

    const forDay = await listLogsForDay(db, dayId);
    expect(forDay).toHaveLength(1);
    expect(forDay[0]?.reps).toBe(8);
  });

  it('logs a set without RPE (stored as null) and defaults the timestamp', async () => {
    const stored = await logSet(db, {
      id: newLogId(),
      dayId: newDayId(),
      slotId: newSlotId(),
      exerciseSlug: slug,
      setNumber: 1,
      reps: 10,
      loadKg: 40,
    });
    expect(stored.rpe).toBeNull();
    expect(stored.completedAt).toBeInstanceOf(Date);
  });

  it('filters exercise history by a since date', async () => {
    const common = { slotId: newSlotId(), exerciseSlug: slug, setNumber: 1, reps: 5, loadKg: 50 };
    await logSet(db, {
      ...common,
      id: newLogId(),
      dayId: newDayId(),
      completedAt: new Date('2025-01-01T00:00:00Z'),
    });
    await logSet(db, {
      ...common,
      id: newLogId(),
      dayId: newDayId(),
      completedAt: new Date('2026-06-01T00:00:00Z'),
    });

    const recent = await listLogsForExercise(db, slug, new Date('2026-01-01T00:00:00Z'));
    expect(recent).toHaveLength(1);
    expect(recent[0]?.completedAt.getUTCFullYear()).toBe(2026);
  });

  it('deletes a log and reports success / failure', async () => {
    const id = newLogId();
    await logSet(db, {
      id,
      dayId: newDayId(),
      slotId: newSlotId(),
      exerciseSlug: slug,
      setNumber: 1,
      reps: 5,
      loadKg: 50,
    });
    expect(await deleteLog(db, id)).toBe(true);
    expect(await deleteLog(db, newLogId())).toBe(false);
  });
});
