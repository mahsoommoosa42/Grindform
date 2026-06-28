/**
 * @file packages/tracker/src/volume.ts
 *
 * Pure volume (tonnage) summaries: total kilograms moved and a
 * per-muscle-group breakdown, for a single day or a whole week. Volume
 * for a set is `load × reps`; it is credited in full to each of the
 * exercise's primary muscles, which is the simple, widely-used convention
 * for a "kg per muscle group" reference.
 */

import type { MuscleGroup } from '@grindform/core';
import type { PlanDay } from '@grindform/planner';
import type { SetLog } from '@grindform/db';

import { collectSlots } from './progress.ts';

/** Kilograms moved for one muscle group. */
export interface MuscleVolume {
  readonly muscle: MuscleGroup;
  readonly kg: number;
}

/** A volume breakdown for a day or week. */
export interface VolumeSummary {
  /** Total tonnage: every logged set's `load × reps`, summed once each. */
  readonly totalKg: number;
  /** Per-muscle tonnage, heaviest first; muscles with no volume are omitted. */
  readonly perMuscle: readonly MuscleVolume[];
}

/** Round to one decimal place, killing binary-float noise. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Sort a muscle→kg map into a stable, heaviest-first list. */
const toSortedList = (perMuscle: ReadonlyMap<MuscleGroup, number>): readonly MuscleVolume[] =>
  [...perMuscle.entries()]
    .map(([muscle, kg]): MuscleVolume => ({ muscle, kg: round1(kg) }))
    .sort((a, b) => b.kg - a.kg || a.muscle.localeCompare(b.muscle));

/** Summarise the volume logged against a single day's slots. */
export const summariseDayVolume = (day: PlanDay, logs: readonly SetLog[]): VolumeSummary => {
  const slotById = new Map(collectSlots(day).map((s) => [s.id, s]));
  const perMuscle = new Map<MuscleGroup, number>();
  let totalKg = 0;
  for (const log of logs) {
    const slot = slotById.get(log.slotId);
    if (slot === undefined) continue;
    const setVolume = log.loadKg * log.reps;
    totalKg += setVolume;
    for (const muscle of slot.primaryMuscles) {
      perMuscle.set(muscle, (perMuscle.get(muscle) ?? 0) + setVolume);
    }
  }
  return { totalKg: round1(totalKg), perMuscle: toSortedList(perMuscle) };
};

/** A day paired with the sets logged against it. */
export interface DayLogs {
  readonly day: PlanDay;
  readonly logs: readonly SetLog[];
}

/** Aggregate per-day volume into a whole-week summary. */
export const summariseWeekVolume = (entries: readonly DayLogs[]): VolumeSummary => {
  const perMuscle = new Map<MuscleGroup, number>();
  let totalKg = 0;
  for (const entry of entries) {
    const day = summariseDayVolume(entry.day, entry.logs);
    totalKg += day.totalKg;
    for (const { muscle, kg } of day.perMuscle) {
      perMuscle.set(muscle, (perMuscle.get(muscle) ?? 0) + kg);
    }
  }
  return { totalKg: round1(totalKg), perMuscle: toSortedList(perMuscle) };
};
