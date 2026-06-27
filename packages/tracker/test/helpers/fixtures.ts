/**
 * @file packages/tracker/test/helpers/fixtures.ts
 *
 * Small builders for tracker tests: exercise slots, plan days, and
 * logged sets, with sensible defaults that individual tests override.
 */

import {
  newDayId,
  newLogId,
  newSlotId,
  parseExerciseSlug,
} from '@grindform/core';
import type { RepScheme } from '@grindform/core';
import type { ExerciseSlot, PlanDay } from '@grindform/planner';
import type { SetLog } from '@grindform/db';

const SCHEME: RepScheme = { sets: 3, repsLow: 8, repsHigh: 10, restSeconds: 90, perSide: false };

export const makeSlot = (over: Partial<ExerciseSlot> = {}): ExerciseSlot => ({
  id: newSlotId(),
  exerciseSlug: parseExerciseSlug('back-squat'),
  name: 'Back squat',
  scheme: SCHEME,
  ...over,
});

export const makeDay = (slots: readonly ExerciseSlot[]): PlanDay => ({
  id: newDayId(),
  weekday: 'mon',
  focus: ['quads'],
  estMinutes: 60,
  blocks: [
    { type: 'warmup', title: 'Warm-up', estMinutes: 8, slots: [], note: 'warm up' },
    { type: 'main', title: 'Main', estMinutes: 30, slots },
  ],
});

export const makeLog = (over: Partial<SetLog> & Pick<SetLog, 'slotId'>): SetLog => ({
  id: newLogId(),
  dayId: newDayId(),
  exerciseSlug: parseExerciseSlug('back-squat'),
  setNumber: 1,
  reps: 10,
  loadKg: 60,
  rpe: null,
  completedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});
