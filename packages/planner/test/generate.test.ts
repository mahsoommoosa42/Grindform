import { describe, expect, it } from 'vitest';

import { GeneratePlanInputSchema, isErr, isOk } from '@grindform/core';
import type { GeneratePlanInput } from '@grindform/core';

import { generatePlan } from '../src/generate.ts';
import type { PlanDay, WeeklyPlan } from '../src/types.ts';

const parse = (raw: unknown): GeneratePlanInput => GeneratePlanInputSchema.parse(raw);

const expectOk = (r: ReturnType<typeof generatePlan>): WeeklyPlan => {
  if (!isOk(r)) throw new Error('expected Ok plan');
  return r.value;
};

const trainingDay = (plan: WeeklyPlan): PlanDay => {
  const day = plan.days[0];
  if (day === undefined) throw new Error('no days');
  return day;
};

const blockTypes = (day: PlanDay): string[] => day.blocks.map((b) => b.type);

describe('generatePlan — happy path', () => {
  it('builds a training day with warm-up, main, accessories, and cool-down', () => {
    const plan = expectOk(
      generatePlan(
        parse({ goal: 'build_muscle', days: [{ weekday: 'mon', focus: ['glutes', 'back'] }] }),
      ),
    );
    const day = trainingDay(plan);
    expect(plan.goal).toBe('build_muscle');
    expect(blockTypes(day)).toContain('warmup');
    expect(blockTypes(day)).toContain('main');
    expect(blockTypes(day)).toContain('accessory');
    expect(blockTypes(day)).toContain('cooldown');
    expect(day.estMinutes).toBeGreaterThan(0);
    expect(plan.id.startsWith('pln_')).toBe(true);
    expect(day.id.startsWith('day_')).toBe(true);
  });

  it('flags main lifts as pyramids and denormalises their primary muscles', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [{ weekday: 'mon', focus: ['glutes'] }] })),
    );
    const main = trainingDay(plan).blocks.find((b) => b.type === 'main');
    expect(main?.slots[0]?.pyramid).toBe(true);
    expect(main?.slots[0]?.primaryMuscles.length).toBeGreaterThan(0);
  });

  it('pairs accessories into supersets (A1/A2, B1/B2, …)', () => {
    const plan = expectOk(
      generatePlan(
        parse({ goal: 'build_muscle', days: [{ weekday: 'mon', focus: ['glutes', 'back'] }] }),
      ),
    );
    const accessory = trainingDay(plan).blocks.find((b) => b.type === 'accessory');
    const slots = accessory?.slots ?? [];
    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots[0]?.superset).toEqual({ group: 'A', order: 1 });
    expect(slots[1]?.superset).toEqual({ group: 'A', order: 2 });
    // accessories are not pyramided by default
    expect(slots[0]?.pyramid).toBeUndefined();
  });

  it('carries a coaching cue onto main lift slots that have one', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'recomp', days: [{ weekday: 'mon', focus: ['glutes'] }] })),
    );
    const main = trainingDay(plan).blocks.find((b) => b.type === 'main');
    expect(main?.slots[0]?.cue).toBeTruthy();
  });
});

describe('generatePlan — time blocks', () => {
  it('prepends a physio block as the first block when physioMinutes > 0', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          timeBudget: { physioMinutes: 15 },
          days: [{ weekday: 'mon', focus: ['glutes'] }],
        }),
      ),
    );
    const day = trainingDay(plan);
    expect(day.blocks[0]?.type).toBe('physio');
    expect(day.blocks[0]?.estMinutes).toBe(15);
    expect(day.blocks[1]?.type).toBe('warmup');
  });

  it('omits warm-up and cool-down blocks when their minutes are 0', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          timeBudget: { warmupMinutes: 0, cooldownMinutes: 0, physioMinutes: 0 },
          days: [{ weekday: 'mon', focus: ['glutes'] }],
        }),
      ),
    );
    const types = blockTypes(trainingDay(plan));
    expect(types).not.toContain('warmup');
    expect(types).not.toContain('cooldown');
    expect(types).not.toContain('physio');
  });
});

describe('generatePlan — blocked days', () => {
  it('passes a Pilates day through with no training blocks', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [{ weekday: 'sat', activity: 'pilates', label: 'Reformer class' }],
        }),
      ),
    );
    const day = trainingDay(plan);
    expect(day.activity).toBe('pilates');
    expect(day.label).toBe('Reformer class');
    expect(day.blocks).toHaveLength(0);
    expect(day.estMinutes).toBe(0);
    expect(day.focus).toHaveLength(0);
  });

  it('blocked day without a label omits the label field', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'recomp', days: [{ weekday: 'sun', activity: 'rest' }] })),
    );
    expect(trainingDay(plan).label).toBeUndefined();
  });

  it('mixes blocked and training days in one week', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [
            { weekday: 'mon', focus: ['glutes'] },
            { weekday: 'tue', activity: 'physio' },
            { weekday: 'wed', focus: ['chest'] },
          ],
        }),
      ),
    );
    expect(plan.days).toHaveLength(3);
    expect(plan.days[1]?.activity).toBe('physio');
  });
});

describe('generatePlan — variation and seed', () => {
  it('A and B variations differ in selection', () => {
    const input = { goal: 'build_muscle', days: [{ weekday: 'mon', focus: ['glutes'] }] };
    const a = expectOk(generatePlan(parse({ ...input, variation: 'A' })));
    const b = expectOk(generatePlan(parse({ ...input, variation: 'B' })));
    const slugsA = trainingDay(a).blocks.flatMap((bl) => bl.slots.map((s) => s.exerciseSlug));
    const slugsB = trainingDay(b).blocks.flatMap((bl) => bl.slots.map((s) => s.exerciseSlug));
    expect(slugsA).not.toEqual(slugsB);
  });

  it('different seeds can produce different selections', () => {
    const input = {
      goal: 'build_muscle',
      days: [{ weekday: 'mon', focus: ['back', 'chest'] }],
    };
    const s1 = expectOk(generatePlan(parse({ ...input, seed: 1 })));
    const s2 = expectOk(generatePlan(parse({ ...input, seed: 99 })));
    const slugs = (p: WeeklyPlan): string[] =>
      trainingDay(p).blocks.flatMap((bl) => bl.slots.map((s) => s.exerciseSlug));
    expect(slugs(s1)).not.toEqual(slugs(s2));
  });

  it('the same seed is reproducible', () => {
    const input = parse({ goal: 'recomp', seed: 42, days: [{ weekday: 'mon', focus: ['back'] }] });
    const slugs = (p: WeeklyPlan): string[] =>
      trainingDay(p).blocks.flatMap((bl) => bl.slots.map((s) => s.exerciseSlug));
    expect(slugs(expectOk(generatePlan(input)))).toEqual(slugs(expectOk(generatePlan(input))));
  });
});

describe('generatePlan — selection edge cases', () => {
  it('adds a conditioning finisher for fat-loss goals', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'lose_fat', days: [{ weekday: 'mon', focus: ['glutes'] }] })),
    );
    const slugs = trainingDay(plan).blocks.flatMap((b) => b.slots.map((s) => s.exerciseSlug));
    const conditioning = ['burpee', 'mountain-climber', 'dumbbell-thruster', 'rowing-intervals'];
    expect(slugs.some((s) => conditioning.includes(s))).toBe(true);
  });

  it('skips the finisher when no conditioning matches the equipment', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'lose_fat',
          equipment: ['cable', 'band'],
          days: [{ weekday: 'mon', focus: ['glutes'] }],
        }),
      ),
    );
    const slugs = trainingDay(plan).blocks.flatMap((b) => b.slots.map((s) => s.exerciseSlug));
    expect(slugs).toContain('cable-pull-through');
    expect(slugs).not.toContain('burpee');
  });

  it('an arm day with no main lift still produces an accessory block', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [{ weekday: 'mon', focus: ['biceps'] }] })),
    );
    const types = blockTypes(trainingDay(plan));
    expect(types).not.toContain('main');
    expect(types).toContain('accessory');
  });

  it('stops at one main lift when time runs out (small session, multi-focus)', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'build_muscle',
          timeBudget: {
            sessionMinutes: 28,
            warmupMinutes: 8,
            cooldownMinutes: 0,
            physioMinutes: 0,
          },
          days: [{ weekday: 'mon', focus: ['glutes', 'back'] }],
        }),
      ),
    );
    const main = trainingDay(plan).blocks.find((b) => b.type === 'main');
    expect(main?.slots).toHaveLength(1);
  });

  it('exhausts a small accessory pool without looping forever', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [{ weekday: 'mon', focus: ['calves'] }] })),
    );
    const acc = trainingDay(plan).blocks.find((b) => b.type === 'accessory');
    // Only two calf accessories exist, so the target of three cannot be met.
    expect(acc?.slots.length).toBeLessThanOrEqual(2);
  });

  it('attaches a label to a training day when provided', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [{ weekday: 'mon', focus: ['glutes'], label: 'Glute day' }],
        }),
      ),
    );
    expect(trainingDay(plan).label).toBe('Glute day');
  });
});

describe('generatePlan — impossible constraints', () => {
  it('fails when no exercise matches the equipment for a focus', () => {
    const result = generatePlan(
      parse({
        goal: 'build_muscle',
        equipment: ['band'],
        days: [{ weekday: 'mon', focus: ['quads'] }],
      }),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.details).toMatchObject({ weekday: 'mon' });
    }
  });
});
