import { describe, expect, it } from 'vitest';

import {
  GeneratePlanInputSchema,
  ProgramGenerationInputSchema,
  newDayId,
  newPlanSessionId,
  type ProgramGenerationInput,
} from '@grindform/core';

import {
  ACWR_WINDOW_WEEKS,
  DEFAULT_PROGRAM_CURVE,
  acuteChronicRatio,
  chronicLoad,
  generateProgram,
  planLoadUnits,
  replanProgram,
  scalePlanLoad,
} from '../src/index.ts';
import type { ProgramWeek } from '../src/index.ts';

const input = (overrides: Partial<ProgramGenerationInput> = {}): ProgramGenerationInput =>
  ProgramGenerationInputSchema.parse({
    ...GeneratePlanInputSchema.parse({
      goal: 'lose_fat',
      days: [
        { weekday: 'mon', sessions: [{ kind: 'training', focus: ['glutes'] }] },
        { weekday: 'tue', sessions: [] },
        { weekday: 'wed', sessions: [{ kind: 'training', focus: ['back'] }] },
        { weekday: 'thu', sessions: [] },
        { weekday: 'fri', sessions: [] },
        { weekday: 'sat', sessions: [{ kind: 'external', activity: 'run', plannedMinutes: 30 }] },
        { weekday: 'sun', sessions: [] },
      ],
    }),
    startWeek: '2026-07-06',
    weeks: 8,
    ...overrides,
  });

describe('planned load primitives', () => {
  it('weights lifting structure and external minutes into unitless load', () => {
    const program = generateProgram(input({ weeks: 1 }));
    const plan = program.weeks[0]?.plan;
    expect(plan).toBeDefined();
    expect(planLoadUnits(plan as NonNullable<typeof plan>)).toBeGreaterThan(0);
    expect(
      planLoadUnits({
        days: [
          {
            id: newDayId(),
            weekday: 'mon',
            sessions: [
              {
                id: newPlanSessionId(),
                kind: 'external',
                activity: 'run',
                plannedMinutes: 10,
                estMinutes: 10,
              },
            ],
            estMinutes: 10,
          },
        ],
      }),
    ).toBe(1);
  });

  it('calculates rolling chronic load and safe zero-chronic ratios', () => {
    expect(chronicLoad([], ACWR_WINDOW_WEEKS)).toBe(0);
    expect(chronicLoad([1, 2, 3, 4, 5], 4)).toBe(3.5);
    expect(acuteChronicRatio(0, [])).toBe(0);
    expect(acuteChronicRatio(10, [])).toBe(Number.POSITIVE_INFINITY);
    expect(acuteChronicRatio(6, [3, 3])).toBe(2);
  });
});

describe('program generation and scaling', () => {
  it('generates a stable curve with a fourth-week deload', () => {
    const program = generateProgram(input());
    expect(DEFAULT_PROGRAM_CURVE).toMatchObject({
      weeklyIncrement: 0.05,
      deloadEvery: 4,
      deloadLoadIndex: 0.6,
      maxAcwr: 1.3,
    });
    expect(program.weeks.map((week) => week.kind)).toEqual([
      'train',
      'train',
      'train',
      'deload',
      'train',
      'train',
      'train',
      'deload',
    ]);
    expect(program.weeks.map((week) => week.loadIndex)).toEqual([
      1, 1.05, 1.1, 0.6, 1, 1.05, 1.1, 0.6,
    ]);
    expect(program.weeks.every((week) => week.plan?.weekIndex === week.weekIndex)).toBe(true);
  });

  it('honours custom curve configuration', () => {
    const program = generateProgram(
      input({
        weeks: 3,
        curve: { weeklyIncrement: 0.1, deloadEvery: 3, deloadLoadIndex: 0.5, maxAcwr: 1.4 },
      }),
    );
    expect(program.weeks.map((week) => [week.kind, week.loadIndex])).toEqual([
      ['train', 1],
      ['train', 1.1],
      ['deload', 0.5],
    ]);
  });

  it('propagates impossible weekly generation constraints', () => {
    expect(() =>
      generateProgram(
        input({
          equipment: ['band'],
          days: [{ weekday: 'mon', sessions: [{ kind: 'training', focus: ['quads'] }] }],
        }),
      ),
    ).toThrow();
  });

  it('scales sets, drops conditioning at deload load, and recomputes time', () => {
    const program = generateProgram(input({ weeks: 1 }));
    const original = program.weeks[0]?.plan;
    expect(original).toBeDefined();
    const scaled = scalePlanLoad(original as NonNullable<typeof original>, 0.6);
    expect(planLoadUnits(scaled)).toBeLessThan(
      planLoadUnits(original as NonNullable<typeof original>),
    );
    expect(
      scaled.days
        .flatMap((day) => day.sessions)
        .filter((session) => session.kind === 'training')
        .flatMap((session) => session.blocks)
        .flatMap((block) => block.slots)
        .some((slot) => slot.scheme.sets < 1),
    ).toBe(false);
    expect(scaled.days.every((day) => day.estMinutes >= 0)).toBe(true);
    const originalWarmup = original?.days
      .flatMap((day) => day.sessions)
      .flatMap((session) => (session.kind === 'training' ? session.blocks : []))
      .find((block) => block.type === 'warmup')?.recommendations;
    const scaledWarmup = scaled.days
      .flatMap((day) => day.sessions)
      .flatMap((session) => (session.kind === 'training' ? session.blocks : []))
      .find((block) => block.type === 'warmup')?.recommendations;
    expect(scaledWarmup).toEqual(originalWarmup);
  });
});

describe('program replanning', () => {
  it('is idempotent, shifts after a break, and keeps past weeks immutable', () => {
    const program = generateProgram(input());
    const breakWeek = '2026-07-27';
    const first = replanProgram({
      program,
      breakWeeks: [breakWeek],
      todayWeek: '2026-07-20',
    });
    const second = replanProgram({
      program,
      breakWeeks: [breakWeek],
      todayWeek: '2026-07-20',
    });
    expect(second).toEqual(first);
    expect(first.weeks).toHaveLength(9);
    expect(first.weeks.slice(0, 2)).toEqual(program.weeks.slice(0, 2));
    expect(first.weeks[2]?.weekStart).toBe('2026-07-20');
    expect(first.weeks[3]).toMatchObject({ weekStart: breakWeek, kind: 'break', loadIndex: 0 });
    expect(first.weeks.at(-1)?.weekStart).toBe('2026-08-31');
  });

  it('caps re-entry load and converts a deload immediately after a break', () => {
    const program = generateProgram(input({ weeks: 6 }));
    const replanned = replanProgram({
      program,
      breakWeeks: ['2026-07-20'],
      todayWeek: '2026-07-06',
    });
    const breakIndex = replanned.weeks.findIndex((week) => week.kind === 'break');
    const returning = replanned.weeks[breakIndex + 1];
    expect(returning?.kind).toBe('train');
    expect(returning?.loadIndex).toBeLessThanOrEqual(1.15);
    const loads = replanned.weeks.map((week) => (week.plan ? planLoadUnits(week.plan) : 0));
    expect(
      acuteChronicRatio(loads[breakIndex + 1] as number, loads.slice(0, breakIndex + 1)),
    ).toBeLessThanOrEqual(1.3);
    expect(
      returning?.plan?.days
        .flatMap((day) => day.sessions)
        .filter((session) => session.kind === 'training')
        .flatMap((session) => session.blocks)
        .find((block) => block.type === 'warmup')?.recommendations?.length,
    ).toBeGreaterThan(0);
  });

  it('never caps a returning training week below the deload floor', () => {
    const program = generateProgram(input({ weeks: 5 }));
    const replanned = replanProgram({
      program,
      breakWeeks: ['2026-07-20', '2026-07-27'],
      todayWeek: '2026-07-13',
    });
    expect(
      replanned.weeks
        .filter((week) => week.kind === 'train')
        .every((week) => week.loadIndex >= (program.input.curve?.deloadLoadIndex ?? 0.6)),
    ).toBe(true);
    expect(
      replanned.weeks.filter((week) => week.kind === 'train').some((week) => week.loadIndex === 0),
    ).toBe(false);
  });

  it('retains conditioning when a deload week is later scaled back up', () => {
    const program = generateProgram(input({ weeks: 4 }));
    const deload = program.weeks[3]?.plan;
    expect(deload).toBeDefined();
    const deloadConditioning = deload?.days
      .flatMap((day) => day.sessions)
      .flatMap((session) => (session.kind === 'training' ? session.blocks : []))
      .flatMap((block) => block.slots)
      .filter((slot) => slot.scheme.repsHigh >= 18);
    expect(deloadConditioning).toHaveLength(0);

    const replanned = replanProgram({
      program,
      breakWeeks: ['2026-07-20'],
      todayWeek: '2026-07-06',
    });
    const returning = replanned.weeks[3]?.plan;
    expect(
      returning?.days
        .flatMap((day) => day.sessions)
        .flatMap((session) => (session.kind === 'training' ? session.blocks : []))
        .flatMap((block) => block.slots)
        .some((slot) => slot.scheme.repsHigh >= 18),
    ).toBe(true);
  });

  it('keeps a past break in the chronic-load history across later replans', () => {
    const program = generateProgram(input({ weeks: 6 }));
    const first = replanProgram({
      program,
      breakWeeks: ['2026-07-13'],
      todayWeek: '2026-07-06',
    });
    const later = replanProgram({
      program: first,
      breakWeeks: [],
      todayWeek: '2026-07-20',
    });
    expect(later.weeks.find((week) => week.weekStart === '2026-07-13')?.kind).toBe('break');
    expect(later.weeks.filter((week) => week.kind === 'break')).toHaveLength(1);
  });

  it('handles consecutive breaks, a final break, and a one-week program', () => {
    const program = generateProgram(input({ weeks: 1 }));
    const oneWeek = replanProgram({
      program,
      breakWeeks: ['2026-07-06'],
      todayWeek: '2026-07-06',
    });
    expect(oneWeek.weeks).toHaveLength(2);
    expect(oneWeek.weeks[0]?.kind).toBe('break');
    expect(oneWeek.weeks[1]?.plan).toBeDefined();

    const longer = generateProgram(input());
    const breaks = replanProgram({
      program: longer,
      breakWeeks: ['2026-07-20', '2026-07-27', '2026-08-24'],
      todayWeek: '2026-07-06',
    });
    expect(breaks.weeks.filter((week) => week.kind === 'break')).toHaveLength(3);
    expect(breaks.weeks.at(-1)?.plan).toBeDefined();
  });

  it('returns the original baseline when no breaks are marked', () => {
    const program = generateProgram(input({ weeks: 2 }));
    expect(replanProgram({ program, breakWeeks: [], todayWeek: program.startWeek }).weeks).toEqual(
      program.weeks,
    );
  });

  it('includes stored zero-load past weeks and stops after a break beyond the baseline', () => {
    const program = generateProgram(input({ weeks: 2 }));
    const first = program.weeks[0];
    const second = program.weeks[1];
    if (first === undefined || second === undefined) throw new Error('expected baseline weeks');
    if (first.weekIndex === undefined) throw new Error('expected indexed baseline week');
    const pastBreak: ProgramWeek = {
      weekStart: first.weekStart,
      weekIndex: first.weekIndex,
      kind: 'break',
      loadIndex: 0,
    };
    const stored = {
      ...program,
      weeks: [pastBreak, second],
      baselineWeeks: [pastBreak, second],
    };
    const replanned = replanProgram({
      program: stored,
      breakWeeks: ['2026-07-20'],
      todayWeek: '2026-07-13',
    });
    expect(replanned.weeks[0]?.kind).toBe('break');
    expect(replanned.weeks.at(-1)?.kind).toBe('break');
  });
});
