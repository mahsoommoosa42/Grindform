import { describe, expect, it } from 'vitest';

import { newSlotId } from '@grindform/core';
import type { RepScheme } from '@grindform/core';

import { suggestProgression } from '../src/progression.ts';
import { makeLog } from './helpers/fixtures.ts';

const scheme: RepScheme = { sets: 3, repsLow: 8, repsHigh: 10, restSeconds: 90, perSide: false };

const slotId = newSlotId();
const session = (
  day: string,
  reps: number,
  loadKg: number,
  sets = 3,
): ReturnType<typeof makeLog>[] =>
  Array.from({ length: sets }, (_, i) =>
    makeLog({
      slotId,
      reps,
      loadKg,
      setNumber: i + 1,
      completedAt: new Date(`${day}T10:00:00Z`),
    }),
  );

describe('suggestProgression', () => {
  it('declines when there is no history', () => {
    const s = suggestProgression([], scheme);
    expect(s.suggestLoadIncrease).toBe(false);
    expect(s.currentTopLoadKg).toBeUndefined();
  });

  it('asks for more sessions when only one is logged', () => {
    const s = suggestProgression(session('2026-01-01', 10, 60), scheme);
    expect(s.suggestLoadIncrease).toBe(false);
    expect(s.reason).toContain('2 sessions');
    expect(s.currentTopLoadKg).toBe(60);
  });

  it('suggests more weight after hitting the top reps across required sessions', () => {
    const history = [...session('2026-01-01', 10, 60), ...session('2026-01-03', 10, 60)];
    const s = suggestProgression(history, scheme);
    expect(s.suggestLoadIncrease).toBe(true);
    expect(s.currentTopLoadKg).toBe(60);
    expect(s.suggestedLoadKg).toBe(62.5);
  });

  it('holds when reps are still below the top of the range', () => {
    const history = [...session('2026-01-01', 8, 60), ...session('2026-01-03', 9, 60)];
    const s = suggestProgression(history, scheme);
    expect(s.suggestLoadIncrease).toBe(false);
    expect(s.reason).toContain('current load');
  });

  it('holds when the recent sessions were at different loads', () => {
    const history = [...session('2026-01-01', 10, 55), ...session('2026-01-03', 10, 60)];
    const s = suggestProgression(history, scheme);
    expect(s.suggestLoadIncrease).toBe(false);
    expect(s.currentTopLoadKg).toBe(60);
  });

  it('honours custom sessionsRequired and incrementKg', () => {
    const history = [
      ...session('2026-01-01', 10, 60),
      ...session('2026-01-03', 10, 60),
      ...session('2026-01-05', 10, 60),
    ];
    const s = suggestProgression(history, scheme, { sessionsRequired: 3, incrementKg: 5 });
    expect(s.suggestLoadIncrease).toBe(true);
    expect(s.suggestedLoadKg).toBe(65);
  });

  it('orders sessions by date regardless of input order', () => {
    const history = [...session('2026-01-05', 10, 70), ...session('2026-01-01', 10, 60)];
    const s = suggestProgression(history, scheme);
    // Most recent session (the 5th, at 70kg) drives the current load.
    expect(s.currentTopLoadKg).toBe(70);
  });
});
