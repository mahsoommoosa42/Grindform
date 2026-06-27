import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newDayId } from '@grindform/core';
import type { Db } from '@grindform/db';
import { listLogsForDay } from '@grindform/db';

import {
  getDayProgress,
  getProgressionSuggestion,
  logCompletedSet,
  markSlotComplete,
} from '../src/track.ts';
import { freshDb } from './helpers/db.ts';
import { makeDay, makeSlot } from './helpers/fixtures.ts';

describe('track orchestration', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('logs a single set with and without RPE', async () => {
    const dayId = newDayId();
    const slot = makeSlot();
    const withRpe = await logCompletedSet(db, {
      dayId,
      slot,
      setNumber: 1,
      reps: 8,
      loadKg: 50,
      rpe: 8,
    });
    expect(withRpe.rpe).toBe(8);

    const withoutRpe = await logCompletedSet(db, {
      dayId,
      slot,
      setNumber: 2,
      reps: 8,
      loadKg: 50,
    });
    expect(withoutRpe.rpe).toBeNull();

    expect(await listLogsForDay(db, dayId)).toHaveLength(2);
  });

  it('marks a slot complete by logging every prescribed set', async () => {
    const dayId = newDayId();
    const slot = makeSlot();
    const logs = await markSlotComplete(db, { dayId, slot, loadKg: 70 });
    expect(logs).toHaveLength(slot.scheme.sets);
    // Defaults reps to the top of the prescribed range.
    expect(logs.every((l) => l.reps === slot.scheme.repsHigh)).toBe(true);
    expect(logs.map((l) => l.setNumber)).toEqual([1, 2, 3]);
  });

  it('marks a slot complete with explicit reps and RPE', async () => {
    const slot = makeSlot();
    const logs = await markSlotComplete(db, {
      dayId: newDayId(),
      slot,
      loadKg: 70,
      reps: 6,
      rpe: 9,
    });
    expect(logs.every((l) => l.reps === 6 && l.rpe === 9)).toBe(true);
  });

  it('summarises day progress from stored logs', async () => {
    const slot = makeSlot();
    const day = makeDay([slot]);
    await markSlotComplete(db, { dayId: day.id, slot, loadKg: 60 });
    const progress = await getDayProgress(db, day);
    expect(progress.percentComplete).toBe(100);
    expect(progress.slots[0]?.topSetLoadKg).toBe(60);
  });

  it('computes a progression suggestion from recent history', async () => {
    const slot = makeSlot();
    for (let i = 0; i < slot.scheme.sets; i += 1) {
      await logCompletedSet(db, {
        dayId: newDayId(),
        slot,
        setNumber: i + 1,
        reps: slot.scheme.repsHigh,
        loadKg: 60,
      });
    }
    const suggestion = await getProgressionSuggestion(db, slot.exerciseSlug, slot.scheme, {
      sessionsRequired: 1,
    });
    expect(suggestion.currentTopLoadKg).toBe(60);
    expect(suggestion.suggestLoadIncrease).toBe(true);
  });

  it('respects a custom lookback window', async () => {
    const slot = makeSlot();
    await logCompletedSet(db, { dayId: newDayId(), slot, setNumber: 1, reps: 10, loadKg: 60 });
    const suggestion = await getProgressionSuggestion(db, slot.exerciseSlug, slot.scheme, {
      lookbackDays: 1,
    });
    // The set was logged "now", so a 1-day lookback still finds it.
    expect(suggestion.currentTopLoadKg).toBe(60);
  });
});
