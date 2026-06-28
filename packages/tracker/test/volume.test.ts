/**
 * @file packages/tracker/test/volume.test.ts
 */

import { describe, expect, it } from 'vitest';

import { summariseDayVolume, summariseWeekVolume } from '../src/volume.ts';
import { makeDay, makeLog, makeSlot } from './helpers/fixtures.ts';

describe('summariseDayVolume', () => {
  it('is empty when nothing is logged', () => {
    const day = makeDay([makeSlot()]);
    expect(summariseDayVolume(day, [])).toEqual({ totalKg: 0, perMuscle: [] });
  });

  it('sums load × reps and attributes it to the slot primary muscles', () => {
    const squat = makeSlot({ primaryMuscles: ['quads', 'glutes'] });
    const day = makeDay([squat]);
    const summary = summariseDayVolume(day, [
      makeLog({ slotId: squat.id, loadKg: 100, reps: 5 }),
      makeLog({ slotId: squat.id, loadKg: 90, reps: 8 }),
    ]);
    // 100*5 + 90*8 = 1220, credited in full to each primary muscle.
    expect(summary.totalKg).toBe(1220);
    expect(summary.perMuscle).toEqual([
      { muscle: 'glutes', kg: 1220 },
      { muscle: 'quads', kg: 1220 },
    ]);
  });

  it('ignores logs whose slot is not in the day', () => {
    const day = makeDay([makeSlot()]);
    const summary = summariseDayVolume(day, [makeLog({ slotId: 'slot_missing' as never })]);
    expect(summary.totalKg).toBe(0);
    expect(summary.perMuscle).toEqual([]);
  });

  it('sorts muscles heaviest-first', () => {
    const a = makeSlot({ primaryMuscles: ['back'] });
    const b = makeSlot({ primaryMuscles: ['biceps'] });
    const day = makeDay([a, b]);
    const summary = summariseDayVolume(day, [
      makeLog({ slotId: a.id, loadKg: 50, reps: 10 }), // back 500
      makeLog({ slotId: b.id, loadKg: 20, reps: 10 }), // biceps 200
    ]);
    expect(summary.perMuscle.map((m) => m.muscle)).toEqual(['back', 'biceps']);
  });
});

describe('summariseWeekVolume', () => {
  it('aggregates per-day volume across the week', () => {
    const monSlot = makeSlot({ primaryMuscles: ['quads'] });
    const friSlot = makeSlot({ primaryMuscles: ['quads', 'back'] });
    const mon = makeDay([monSlot]);
    const fri = makeDay([friSlot]);
    const week = summariseWeekVolume([
      { day: mon, logs: [makeLog({ slotId: monSlot.id, loadKg: 100, reps: 5 })] }, // 500
      { day: fri, logs: [makeLog({ slotId: friSlot.id, loadKg: 60, reps: 10 })] }, // 600
    ]);
    expect(week.totalKg).toBe(1100);
    expect(week.perMuscle).toEqual([
      { muscle: 'quads', kg: 1100 },
      { muscle: 'back', kg: 600 },
    ]);
  });

  it('is empty for a week with no logs', () => {
    expect(summariseWeekVolume([])).toEqual({ totalKg: 0, perMuscle: [] });
  });
});
