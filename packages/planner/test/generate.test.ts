import { describe, expect, it } from 'vitest';

import { GeneratePlanInputSchema, isErr, isOk } from '@grindform/core';
import type { GeneratePlanInput } from '@grindform/core';

import { generatePlan } from '../src/generate.ts';
import type { PlanDay, SessionBlock, TrainingSession, WeeklyPlan } from '../src/types.ts';

const parse = (raw: unknown): GeneratePlanInput => GeneratePlanInputSchema.parse(raw);

const expectOk = (r: ReturnType<typeof generatePlan>): WeeklyPlan => {
  if (!isOk(r)) throw new Error('expected Ok plan');
  return r.value;
};

const firstDay = (plan: WeeklyPlan): PlanDay => {
  const day = plan.days[0];
  if (day === undefined) throw new Error('no days');
  return day;
};

/** The first training session of the plan's first day. */
const firstTraining = (plan: WeeklyPlan): TrainingSession => {
  const session = firstDay(plan).sessions.find((s) => s.kind === 'training');
  if (session === undefined || session.kind !== 'training') throw new Error('no training session');
  return session;
};

const blockTypes = (session: TrainingSession): string[] => session.blocks.map((b) => b.type);
const allSlugs = (session: TrainingSession): string[] =>
  session.blocks.flatMap((b: SessionBlock) => b.slots.map((s) => s.exerciseSlug));

/** Shorthand: a day holding a single training session. */
const train = (weekday: string, focus: string[], label?: string): unknown => ({
  weekday,
  sessions: [{ kind: 'training', focus, ...(label === undefined ? {} : { label }) }],
});

describe('generatePlan — happy path', () => {
  it('builds a training session with warm-up, main, accessories, and cool-down', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [train('mon', ['glutes', 'back'])] })),
    );
    const session = firstTraining(plan);
    expect(plan.goal).toBe('build_muscle');
    expect(blockTypes(session)).toContain('warmup');
    expect(blockTypes(session)).toContain('main');
    expect(blockTypes(session)).toContain('accessory');
    expect(blockTypes(session)).toContain('cooldown');
    expect(session.estMinutes).toBeGreaterThan(0);
    expect(firstDay(plan).estMinutes).toBe(session.estMinutes);
    expect(plan.id.startsWith('pln_')).toBe(true);
    expect(firstDay(plan).id.startsWith('day_')).toBe(true);
    expect(session.id.startsWith('pss_')).toBe(true);
  });

  it('flags main lifts as pyramids and denormalises their primary muscles', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [train('mon', ['glutes'])] })),
    );
    const main = firstTraining(plan).blocks.find((b) => b.type === 'main');
    expect(main?.slots[0]?.pyramid).toBe(true);
    expect(main?.slots[0]?.primaryMuscles.length).toBeGreaterThan(0);
  });

  it('pairs accessories into supersets (A1/A2, B1/B2, …)', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [train('mon', ['glutes', 'back'])] })),
    );
    const accessory = firstTraining(plan).blocks.find((b) => b.type === 'accessory');
    const slots = accessory?.slots ?? [];
    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots[0]?.superset).toEqual({ group: 'A', order: 1 });
    expect(slots[1]?.superset).toEqual({ group: 'A', order: 2 });
    expect(slots[0]?.pyramid).toBeUndefined();
  });

  it('carries a coaching cue onto main lift slots that have one', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'recomp', days: [train('mon', ['glutes'])] })),
    );
    const main = firstTraining(plan).blocks.find((b) => b.type === 'main');
    expect(main?.slots[0]?.cue).toBeTruthy();
  });
});

describe('generatePlan — time blocks & physio placement', () => {
  it('places physio before the warm-up by default (position 0)', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          timeBudget: { physioMinutes: 15 },
          days: [train('mon', ['glutes'])],
        }),
      ),
    );
    const session = firstTraining(plan);
    expect(session.blocks[0]?.type).toBe('physio');
    expect(session.blocks[0]?.estMinutes).toBe(15);
    expect(session.blocks[1]?.type).toBe('warmup');
  });

  it('places physio at the end of the session when physioPosition is 4', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [
            {
              weekday: 'mon',
              sessions: [
                {
                  kind: 'training',
                  focus: ['glutes'],
                  timeBudget: { physioMinutes: 12, physioPosition: 4 },
                },
              ],
            },
          ],
        }),
      ),
    );
    const types = blockTypes(firstTraining(plan));
    expect(types[types.length - 1]).toBe('physio');
  });

  it('places physio after the main lift when physioPosition is 2', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'build_muscle',
          days: [
            {
              weekday: 'mon',
              sessions: [
                {
                  kind: 'training',
                  focus: ['glutes'],
                  timeBudget: { physioMinutes: 10, physioPosition: 2 },
                },
              ],
            },
          ],
        }),
      ),
    );
    const types = blockTypes(firstTraining(plan));
    const physioAt = types.indexOf('physio');
    const mainAt = types.indexOf('main');
    expect(physioAt).toBe(mainAt + 1);
  });

  it('honours a per-session time-budget override', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          timeBudget: { sessionMinutes: 60 },
          days: [
            {
              weekday: 'mon',
              sessions: [
                { kind: 'training', focus: ['glutes'], timeBudget: { sessionMinutes: 30 } },
              ],
            },
          ],
        }),
      ),
    );
    // A 30-minute session estimates fewer minutes than the 60-minute default.
    expect(firstTraining(plan).estMinutes).toBeLessThanOrEqual(40);
  });

  it('omits warm-up and cool-down blocks when their minutes are 0', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          timeBudget: { warmupMinutes: 0, cooldownMinutes: 0, physioMinutes: 0 },
          days: [train('mon', ['glutes'])],
        }),
      ),
    );
    const types = blockTypes(firstTraining(plan));
    expect(types).not.toContain('warmup');
    expect(types).not.toContain('cooldown');
    expect(types).not.toContain('physio');
  });
});

describe('generatePlan — external & multi-session days', () => {
  it('builds an external session with no exercise blocks', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [
            {
              weekday: 'sat',
              sessions: [
                { kind: 'external', activity: 'run', label: 'Parkrun', plannedMinutes: 35 },
              ],
            },
          ],
        }),
      ),
    );
    const day = firstDay(plan);
    const [session] = day.sessions;
    expect(session?.kind).toBe('external');
    if (session?.kind === 'external') {
      expect(session.activity).toBe('run');
      expect(session.label).toBe('Parkrun');
      expect(session.plannedMinutes).toBe(35);
      expect(session.id.startsWith('pss_')).toBe(true);
    }
    expect(day.estMinutes).toBe(35);
  });

  it('an external session without a label omits the label field', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [{ weekday: 'sun', sessions: [{ kind: 'external', activity: 'physio' }] }],
        }),
      ),
    );
    const [session] = firstDay(plan).sessions;
    if (session?.kind === 'external') expect(session.label).toBeUndefined();
  });

  it('treats a day with no sessions as a rest day', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'recomp', days: [{ weekday: 'sun', sessions: [] }] })),
    );
    const day = firstDay(plan);
    expect(day.sessions).toHaveLength(0);
    expect(day.estMinutes).toBe(0);
  });

  it('carries a day-level label through to the generated plan', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [
            {
              weekday: 'mon',
              label: 'Leg day',
              sessions: [{ kind: 'training', focus: ['glutes'] }],
            },
          ],
        }),
      ),
    );
    expect(firstDay(plan).label).toBe('Leg day');
  });

  it('builds a day with both a training session and an external run', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'build_muscle',
          days: [
            {
              weekday: 'mon',
              sessions: [
                { kind: 'training', focus: ['glutes'] },
                { kind: 'external', activity: 'run', plannedMinutes: 25 },
              ],
            },
          ],
        }),
      ),
    );
    const day = firstDay(plan);
    expect(day.sessions).toHaveLength(2);
    expect(day.sessions[0]?.kind).toBe('training');
    expect(day.sessions[1]?.kind).toBe('external');
    expect(day.estMinutes).toBe((day.sessions[0]?.estMinutes ?? 0) + 25);
  });

  it('mixes external and training days in one week', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'recomp',
          days: [
            train('mon', ['glutes']),
            { weekday: 'tue', sessions: [{ kind: 'external', activity: 'physio' }] },
            train('wed', ['chest']),
          ],
        }),
      ),
    );
    expect(plan.days).toHaveLength(3);
    expect(plan.days[1]?.sessions[0]?.kind).toBe('external');
  });
});

describe('generatePlan — variation and seed', () => {
  it('A and B variations differ in selection', () => {
    const input = { goal: 'build_muscle', days: [train('mon', ['glutes'])] };
    const a = expectOk(generatePlan(parse({ ...input, variation: 'A' })));
    const b = expectOk(generatePlan(parse({ ...input, variation: 'B' })));
    expect(allSlugs(firstTraining(a))).not.toEqual(allSlugs(firstTraining(b)));
  });

  it('different seeds can produce different selections', () => {
    const input = { goal: 'build_muscle', days: [train('mon', ['back', 'chest'])] };
    const s1 = expectOk(generatePlan(parse({ ...input, seed: 1 })));
    const s2 = expectOk(generatePlan(parse({ ...input, seed: 99 })));
    expect(allSlugs(firstTraining(s1))).not.toEqual(allSlugs(firstTraining(s2)));
  });

  it('the same seed is reproducible', () => {
    const input = parse({ goal: 'recomp', seed: 42, days: [train('mon', ['back'])] });
    expect(allSlugs(firstTraining(expectOk(generatePlan(input))))).toEqual(
      allSlugs(firstTraining(expectOk(generatePlan(input)))),
    );
  });
});

describe('generatePlan — selection edge cases', () => {
  it('adds a conditioning finisher for fat-loss goals', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'lose_fat', days: [train('mon', ['glutes'])] })),
    );
    const conditioning = ['burpee', 'mountain-climber', 'dumbbell-thruster', 'rowing-intervals'];
    expect(allSlugs(firstTraining(plan)).some((s) => conditioning.includes(s))).toBe(true);
  });

  it('skips the finisher when no conditioning matches the equipment', () => {
    const plan = expectOk(
      generatePlan(
        parse({
          goal: 'lose_fat',
          equipment: ['cable', 'band'],
          days: [train('mon', ['glutes'])],
        }),
      ),
    );
    const slugs = allSlugs(firstTraining(plan));
    expect(slugs).toContain('cable-pull-through');
    expect(slugs).not.toContain('burpee');
  });

  it('an arm session with no main lift still produces an accessory block', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [train('mon', ['biceps'])] })),
    );
    const types = blockTypes(firstTraining(plan));
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
          days: [train('mon', ['glutes', 'back'])],
        }),
      ),
    );
    const main = firstTraining(plan).blocks.find((b) => b.type === 'main');
    expect(main?.slots).toHaveLength(1);
  });

  it('exhausts a small accessory pool without looping forever', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'build_muscle', days: [train('mon', ['calves'])] })),
    );
    const acc = firstTraining(plan).blocks.find((b) => b.type === 'accessory');
    expect(acc?.slots.length).toBeLessThanOrEqual(2);
  });

  it('attaches a label to a training session when provided', () => {
    const plan = expectOk(
      generatePlan(parse({ goal: 'recomp', days: [train('mon', ['glutes'], 'Glute day')] })),
    );
    expect(firstTraining(plan).label).toBe('Glute day');
  });
});

describe('generatePlan — impossible constraints', () => {
  it('fails when no exercise matches the equipment for a focus', () => {
    const result = generatePlan(
      parse({ goal: 'build_muscle', equipment: ['band'], days: [train('mon', ['quads'])] }),
    );
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.details).toMatchObject({ focus: ['quads'] });
    }
  });
});
