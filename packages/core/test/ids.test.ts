import { describe, expect, it } from 'vitest';

import {
  isAuditId,
  isCustomExerciseId,
  isDayId,
  isExerciseSlug,
  isLogId,
  isPlanId,
  isPlanSessionId,
  isSessionId,
  isSlotId,
  isUserId,
  newAuditId,
  newCustomExerciseId,
  newDayId,
  newLogId,
  newPlanId,
  newPlanSessionId,
  newSessionId,
  newSlotId,
  newUserId,
  parseAuditId,
  parseCustomExerciseId,
  parseDayId,
  parseExerciseSlug,
  parseLogId,
  parsePlanId,
  parseSessionId,
  parseSlotId,
  parseUserId,
} from '../src/ids.ts';

describe('id factories produce prefixed, well-formed, sortable IDs', () => {
  const cases = [
    { make: newUserId, prefix: 'usr', guard: isUserId },
    { make: newSessionId, prefix: 'ses', guard: isSessionId },
    { make: newAuditId, prefix: 'aud', guard: isAuditId },
    { make: newPlanId, prefix: 'pln', guard: isPlanId },
    { make: newDayId, prefix: 'day', guard: isDayId },
    { make: newPlanSessionId, prefix: 'pss', guard: isPlanSessionId },
    { make: newSlotId, prefix: 'slt', guard: isSlotId },
    { make: newLogId, prefix: 'log', guard: isLogId },
    { make: newCustomExerciseId, prefix: 'cex', guard: isCustomExerciseId },
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

  it('parseUserId / parseDayId / parseSlotId / parseLogId round-trip valid ids', () => {
    const user = newUserId();
    const day = newDayId();
    const slot = newSlotId();
    const log = newLogId();
    expect(parseUserId(user)).toBe(user);
    expect(parseDayId(day)).toBe(day);
    expect(parseSlotId(slot)).toBe(slot);
    expect(parseLogId(log)).toBe(log);
  });

  it('parseSessionId / parseAuditId round-trip valid ids and throw otherwise', () => {
    const session = newSessionId();
    const audit = newAuditId();
    expect(parseSessionId(session)).toBe(session);
    expect(parseAuditId(audit)).toBe(audit);
    expect(() => parseSessionId('nope')).toThrow('invalid SessionId: nope');
    expect(() => parseAuditId('nope')).toThrow('invalid AuditId: nope');
  });

  it('parseCustomExerciseId round-trips valid ids and throws otherwise', () => {
    const id = newCustomExerciseId();
    expect(parseCustomExerciseId(id)).toBe(id);
    expect(() => parseCustomExerciseId('nope')).toThrow('invalid CustomExerciseId: nope');
  });

  it('parseUserId / parseDayId / parseSlotId / parseLogId throw on bad input', () => {
    expect(() => parseUserId('nope')).toThrow('invalid UserId: nope');
    expect(() => parseDayId('nope')).toThrow('invalid DayId: nope');
    expect(() => parseSlotId('nope')).toThrow('invalid SlotId: nope');
    expect(() => parseLogId('nope')).toThrow('invalid LogId: nope');
  });
});
