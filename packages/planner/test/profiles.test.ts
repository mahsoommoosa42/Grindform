import { describe, expect, it } from 'vitest';

import { GoalSchema } from '@grindform/core';

import {
  estimateSlotMinutes,
  GOAL_PROFILES,
  schemeForRole,
  templateForRole,
} from '../src/profiles.ts';

describe('GOAL_PROFILES', () => {
  it('defines a profile for every goal', () => {
    for (const goal of GoalSchema.options) {
      expect(GOAL_PROFILES[goal]).toBeDefined();
    }
  });
});

describe('templateForRole', () => {
  const profile = GOAL_PROFILES.recomp;

  it('maps each role to its template', () => {
    expect(templateForRole(profile, 'main')).toBe(profile.main);
    expect(templateForRole(profile, 'accessory')).toBe(profile.accessory);
    expect(templateForRole(profile, 'conditioning')).toBe(profile.conditioning);
    expect(templateForRole(profile, 'mobility')).toBe(profile.isolation);
  });
});

describe('schemeForRole', () => {
  it('applies perSide=false for bilateral work', () => {
    expect(schemeForRole(GOAL_PROFILES.recomp, 'main', false).perSide).toBe(false);
  });

  it('applies perSide=true for unilateral work', () => {
    expect(schemeForRole(GOAL_PROFILES.recomp, 'accessory', true).perSide).toBe(true);
  });
});

describe('estimateSlotMinutes', () => {
  it('accounts for sets, reps, and rest', () => {
    // 4 sets, avg 8 reps × 4s = 32s work + 120s rest = 152s/set × 4 = 608s → 11 min.
    const mins = estimateSlotMinutes({
      sets: 4,
      repsLow: 8,
      repsHigh: 8,
      restSeconds: 120,
      perSide: false,
    });
    expect(mins).toBe(11);
  });

  it('doubles work time for unilateral movements', () => {
    const bilateral = estimateSlotMinutes({
      sets: 3,
      repsLow: 10,
      repsHigh: 10,
      restSeconds: 60,
      perSide: false,
    });
    const unilateral = estimateSlotMinutes({
      sets: 3,
      repsLow: 10,
      repsHigh: 10,
      restSeconds: 60,
      perSide: true,
    });
    expect(unilateral).toBeGreaterThan(bilateral);
  });

  it('never returns less than one minute', () => {
    expect(
      estimateSlotMinutes({ sets: 1, repsLow: 1, repsHigh: 1, restSeconds: 0, perSide: false }),
    ).toBe(1);
  });
});
