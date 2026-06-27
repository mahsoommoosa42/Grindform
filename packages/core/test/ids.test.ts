import { describe, expect, it } from 'vitest';

import {
  isDayId,
  isExerciseSlug,
  isLogId,
  isPlanId,
  isSlotId,
  isUserId,
  newDayId,
  newLogId,
  newPlanId,
  newSlotId,
  newUserId,
  parseExerciseSlug,
  parsePlanId,
} from '../src/ids.ts';

describe('id factories produce prefixed, well-formed, sortable IDs', () => {
  const cases = [
    { make: newUserId, prefix: 'usr', guard: isUserId },
    { make: newPlanId, prefix: 'pln', guard: isPlanId },
    { make: newDayId, prefix: 'day', guard: isDayId },
    { make: newSlotId, prefix: 'slt', guard: isSlotId },
    { make: newLogId, prefix: 'log', guard: isLogId },
  ] as const;

  for (const { make, prefix, guard } of cases) {
    it(`${prefix}_ ids are recognised by their guard`, () => {
      const id = make();
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id).toHaveLength(prefix.length + 1 + 26);
      expect(guard(id)).toBe(true);
    });
  }

  it('ids minted across time sort by creation order', async () => {
    const a = newPlanId();
    await new Promise((r) => setTimeout(r, 2));
    const b = newPlanId();
    expect([b, a].sort()).toEqual([a, b]);
  });
});

describe('guards reject malformed and cross-prefix ids', () => {
  it('rejects wrong prefix', () => {
    expect(isPlanId(newUserId())).toBe(false);
  });

  it('rejects too-short bodies', () => {
    expect(isPlanId('pln_TOOSHORT')).toBe(false);
  });

  it('rejects ambiguous characters outside the Crockford alphabet', () => {
    expect(isPlanId(`pln_${'I'.repeat(26)}`)).toBe(false);
  });
});

describe('exercise slugs', () => {
  it('accepts well-formed kebab-case slugs', () => {
    expect(isExerciseSlug('barbell-hip-thrust')).toBe(true);
    expect(isExerciseSlug('row')).toBe(true);
    expect(isExerciseSlug('db-row-3')).toBe(true);
  });

  it('rejects uppercase, spaces, edge hyphens, and too-short slugs', () => {
    expect(isExerciseSlug('Barbell')).toBe(false);
    expect(isExerciseSlug('hip thrust')).toBe(false);
    expect(isExerciseSlug('-row')).toBe(false);
    expect(isExerciseSlug('row-')).toBe(false);
    expect(isExerciseSlug('double--dash')).toBe(false);
    expect(isExerciseSlug('a')).toBe(false);
    expect(isExerciseSlug('x'.repeat(61))).toBe(false);
  });

  it('parseExerciseSlug brands valid slugs and throws otherwise', () => {
    expect(parseExerciseSlug('cable-fly')).toBe('cable-fly');
    expect(() => parseExerciseSlug('Nope!')).toThrow('invalid ExerciseSlug: Nope!');
  });
});

describe('throwing parsers', () => {
  it('parsePlanId returns a branded id for valid input', () => {
    const id = newPlanId();
    expect(parsePlanId(id)).toBe(id);
  });

  it('parsePlanId throws for invalid input', () => {
    expect(() => parsePlanId('nope')).toThrow('invalid PlanId: nope');
  });
});
