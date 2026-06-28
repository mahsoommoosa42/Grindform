import { describe, expect, it } from 'vitest';

import { newPlanId } from '../src/ids.ts';
import {
  AccountStatusSchema,
  AuditActionSchema,
  DaySpecSchema,
  EmailSchema,
  ExerciseSlugSchema,
  GeneratePlanInputSchema,
  LoginInputSchema,
  PlanIdSchema,
  RegisterInputSchema,
  RepSchemeSchema,
  RoleSchema,
  TimeBudgetSchema,
  WEEKDAYS,
} from '../src/schemas.ts';

describe('enums', () => {
  it('WEEKDAYS is Monday-first with seven entries', () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0]).toBe('mon');
    expect(WEEKDAYS[6]).toBe('sun');
  });
});

describe('branded-id schemas', () => {
  it('ExerciseSlugSchema accepts a valid slug and rejects junk', () => {
    expect(ExerciseSlugSchema.parse('barbell-hip-thrust')).toBe('barbell-hip-thrust');
    expect(ExerciseSlugSchema.safeParse('Nope!').success).toBe(false);
  });

  it('PlanIdSchema accepts a valid id and rejects junk', () => {
    const id = newPlanId();
    expect(PlanIdSchema.parse(id)).toBe(id);
    expect(PlanIdSchema.safeParse('nope').success).toBe(false);
  });
});

describe('RepSchemeSchema', () => {
  it('accepts a fixed scheme and defaults perSide to false', () => {
    const r = RepSchemeSchema.parse({ sets: 4, repsLow: 8, repsHigh: 8, restSeconds: 120 });
    expect(r.perSide).toBe(false);
  });

  it('accepts a ranged scheme with perSide', () => {
    const r = RepSchemeSchema.parse({
      sets: 3,
      repsLow: 8,
      repsHigh: 12,
      restSeconds: 90,
      perSide: true,
    });
    expect(r.perSide).toBe(true);
  });

  it('rejects repsHigh < repsLow', () => {
    const res = RepSchemeSchema.safeParse({ sets: 3, repsLow: 12, repsHigh: 8, restSeconds: 60 });
    expect(res.success).toBe(false);
  });
});

describe('TimeBudgetSchema', () => {
  it('applies sensible defaults', () => {
    const b = TimeBudgetSchema.parse({});
    expect(b).toEqual({
      sessionMinutes: 60,
      warmupMinutes: 8,
      cooldownMinutes: 5,
      physioMinutes: 0,
      physioPosition: 0,
    });
  });

  it('accepts an explicit physio block and placement', () => {
    const b = TimeBudgetSchema.parse({ physioMinutes: 15, physioPosition: 3 });
    expect(b.physioMinutes).toBe(15);
    expect(b.physioPosition).toBe(3);
  });

  it('rejects an out-of-range physio placement', () => {
    expect(TimeBudgetSchema.safeParse({ physioPosition: 5 }).success).toBe(false);
  });
});

describe('DaySpecSchema', () => {
  it('accepts a training session day', () => {
    const d = DaySpecSchema.parse({
      weekday: 'mon',
      sessions: [{ kind: 'training', focus: ['glutes', 'shoulders'] }],
    });
    expect(d.sessions).toHaveLength(1);
    const s = d.sessions[0];
    expect(s?.kind).toBe('training');
    if (s?.kind === 'training') expect(s.focus).toEqual(['glutes', 'shoulders']);
  });

  it('accepts an external session day with a default duration', () => {
    const d = DaySpecSchema.parse({
      weekday: 'sat',
      sessions: [{ kind: 'external', activity: 'run' }],
    });
    const s = d.sessions[0];
    expect(s?.kind).toBe('external');
    if (s?.kind === 'external') expect(s.plannedMinutes).toBe(30);
  });

  it('accepts a multi-session day (training + external)', () => {
    const d = DaySpecSchema.parse({
      weekday: 'tue',
      sessions: [
        { kind: 'training', focus: ['back'] },
        { kind: 'external', activity: 'run', plannedMinutes: 40 },
      ],
    });
    expect(d.sessions).toHaveLength(2);
  });

  it('treats a day with no sessions as a valid rest day', () => {
    const d = DaySpecSchema.parse({ weekday: 'sun' });
    expect(d.sessions).toEqual([]);
  });

  it('rejects a training session with no focus', () => {
    expect(
      DaySpecSchema.safeParse({ weekday: 'mon', sessions: [{ kind: 'training', focus: [] }] })
        .success,
    ).toBe(false);
  });

  it('rejects more than four sessions in a day', () => {
    const sessions = Array.from({ length: 5 }, () => ({ kind: 'external', activity: 'run' }));
    expect(DaySpecSchema.safeParse({ weekday: 'mon', sessions }).success).toBe(false);
  });
});

describe('GeneratePlanInputSchema', () => {
  it('fills equipment + timeBudget + variation defaults', () => {
    const input = GeneratePlanInputSchema.parse({
      goal: 'recomp',
      days: [{ weekday: 'mon', sessions: [{ kind: 'training', focus: ['glutes'] }] }],
    });
    expect(input.experience).toBe('intermediate');
    expect(input.variation).toBe('A');
    expect(input.equipment.length).toBeGreaterThan(0);
    expect(input.timeBudget.sessionMinutes).toBe(60);
  });

  it('rejects an empty days array', () => {
    expect(GeneratePlanInputSchema.safeParse({ goal: 'recomp', days: [] }).success).toBe(false);
  });

  it('rejects more than seven days', () => {
    const days = WEEKDAYS.map((weekday) => ({
      weekday,
      sessions: [{ kind: 'training' as const, focus: ['core' as const] }],
    }));
    expect(
      GeneratePlanInputSchema.safeParse({ goal: 'recomp', days: [...days, days[0]] }).success,
    ).toBe(false);
  });
});

describe('accounts & auth schemas', () => {
  it('EmailSchema trims, lowercases, and validates shape', () => {
    expect(EmailSchema.parse('  Gargi@Example.COM ')).toBe('gargi@example.com');
    expect(EmailSchema.safeParse('nope').success).toBe(false);
    expect(EmailSchema.safeParse('a@b').success).toBe(false);
    expect(EmailSchema.safeParse('a b@c.com').success).toBe(false);
  });

  it('RoleSchema and AccountStatusSchema fix their vocabularies', () => {
    expect(RoleSchema.options).toEqual(['member', 'admin']);
    expect(AccountStatusSchema.options).toEqual(['active', 'disabled']);
  });

  it('RegisterInputSchema requires acceptTerms === true and an 8+ char password', () => {
    const ok = RegisterInputSchema.parse({
      email: 'gargi@example.com',
      password: 'correct-horse',
      acceptTerms: true,
    });
    expect(ok.acceptTerms).toBe(true);
    expect(
      RegisterInputSchema.safeParse({
        email: 'gargi@example.com',
        password: 'short',
        acceptTerms: true,
      }).success,
    ).toBe(false);
    expect(
      RegisterInputSchema.safeParse({
        email: 'gargi@example.com',
        password: 'long-enough',
        acceptTerms: false,
      }).success,
    ).toBe(false);
  });

  it('LoginInputSchema accepts any non-empty password', () => {
    expect(LoginInputSchema.parse({ email: 'a@b.com', password: 'x' }).password).toBe('x');
    expect(LoginInputSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });

  it('AuditActionSchema enumerates the closed action vocabulary', () => {
    expect(AuditActionSchema.safeParse('admin.user.delete').success).toBe(true);
    expect(AuditActionSchema.safeParse('account.hack').success).toBe(false);
  });
});
