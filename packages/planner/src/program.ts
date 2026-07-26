/**
 * Multi-week program generation and pure break-week replanning.
 */

import {
  ProgramCurveConfigSchema,
  newDayId,
  newPlanId,
  newPlanSessionId,
  newSlotId,
  startOfIsoWeek,
} from '@grindform/core';
import type {
  ProgramCurveConfig,
  ProgramGenerationInput,
  ProgramWeekKind,
  WeekStart,
} from '@grindform/core';
import { generatePlan } from './generate.ts';
import { estimateSlotMinutes } from './profiles.ts';
import { acuteChronicRatio, chronicLoad, planLoadUnits } from './load.ts';
import type {
  ExerciseSlot,
  PlanDay,
  PlanSession,
  SessionBlock,
  TrainingSession,
  WeeklyPlan,
} from './types.ts';

/** Named defaults for the baseline progression curve. */
export const DEFAULT_PROGRAM_CURVE: ProgramCurveConfig = ProgramCurveConfigSchema.parse({});

export interface ProgramWeek {
  readonly weekStart: WeekStart;
  readonly weekIndex?: number;
  readonly kind: ProgramWeekKind;
  readonly loadIndex: number;
  readonly plan?: WeeklyPlan;
}

export interface TrainingProgram {
  readonly startWeek: WeekStart;
  readonly weekCount: number;
  readonly input: ProgramGenerationInput;
  readonly basePlan: WeeklyPlan;
  readonly weeks: readonly ProgramWeek[];
  /** The un-replanned baseline, retained as the source for idempotent replans. */
  readonly baselineWeeks: readonly ProgramWeek[];
}

export interface ReplanInput {
  readonly program: TrainingProgram;
  readonly breakWeeks: readonly WeekStart[];
  readonly todayWeek: WeekStart;
}

const DAY_MS = 86_400_000;
const weekAfter = (week: WeekStart, amount: number): WeekStart =>
  startOfIsoWeek(new Date(new Date(`${week}T00:00:00.000Z`).getTime() + amount * 7 * DAY_MS));

const curveFor = (input: ProgramGenerationInput): ProgramCurveConfig =>
  ProgramCurveConfigSchema.parse(input.curve ?? {});

const baselineLoadIndex = (
  weekIndex: number,
  curve: ProgramCurveConfig,
): { kind: ProgramWeekKind; loadIndex: number } => {
  const position = weekIndex % curve.deloadEvery;
  if (position === curve.deloadEvery - 1) {
    return { kind: 'deload', loadIndex: curve.deloadLoadIndex };
  }
  return { kind: 'train', loadIndex: 1 + position * curve.weeklyIncrement };
};

const withMetadata = (
  plan: WeeklyPlan,
  weekIndex: number,
  kind: ProgramWeekKind,
  loadIndex: number,
): WeeklyPlan => ({ ...plan, weekIndex, kind, loadIndex });

const clonePlanIds = (plan: WeeklyPlan): WeeklyPlan => ({
  ...plan,
  id: newPlanId(),
  days: plan.days.map((day) => ({
    ...day,
    id: newDayId(),
    sessions: day.sessions.map((session) => ({
      ...session,
      id: newPlanSessionId(),
      ...(session.kind === 'training'
        ? {
            blocks: session.blocks.map((block) => ({
              ...block,
              slots: block.slots.map((slot) => ({ ...slot, id: newSlotId() })),
            })),
          }
        : {}),
    })),
  })),
});

const rekeyPlanIds = (plan: WeeklyPlan, key: WeeklyPlan): WeeklyPlan => ({
  ...plan,
  id: key.id,
  days: plan.days.map((day, dayIndex) => {
    const keyDay = key.days[dayIndex] as PlanDay;
    return {
      ...day,
      id: keyDay.id,
      sessions: day.sessions.map((session, sessionIndex) => {
        const keySession = keyDay.sessions[sessionIndex] as PlanSession;
        return {
          ...session,
          id: keySession.id,
          ...(session.kind === 'training'
            ? {
                blocks: session.blocks.map((block, blockIndex) => {
                  const keyBlock = (keySession as TrainingSession).blocks[blockIndex];
                  return {
                    ...block,
                    slots: block.slots.map((slot, slotIndex) => {
                      const keySlot = keyBlock?.slots[slotIndex];
                      return { ...slot, ...(keySlot === undefined ? {} : { id: keySlot.id }) };
                    }),
                  };
                }),
              }
            : {}),
        };
      }),
    };
  }),
});

const slotRole = (slot: ExerciseSlot): 'main' | 'accessory' | 'conditioning' => {
  if (slot.pyramid === true) return 'main';
  return slot.scheme.repsHigh >= 18 ? 'conditioning' : 'accessory';
};

const scaleSlot = (slot: ExerciseSlot, loadIndex: number): ExerciseSlot => ({
  ...slot,
  scheme: {
    ...slot.scheme,
    sets: Math.max(1, Math.round(slot.scheme.sets * loadIndex)),
  },
});

const scaleTrainingSession = (session: TrainingSession, loadIndex: number): TrainingSession => {
  const blocks: SessionBlock[] = session.blocks
    .map((block) => {
      const slots = block.slots
        .filter((slot) => !(slotRole(slot) === 'conditioning' && loadIndex < 0.75))
        .map((slot) => scaleSlot(slot, loadIndex));
      const estMinutes =
        block.type === 'main' || block.type === 'accessory'
          ? slots.reduce((sum, slot) => sum + estimateSlotMinutes(slot.scheme), 0)
          : block.estMinutes;
      return { ...block, slots, estMinutes };
    })
    .filter(
      (block) => !(block.type === 'main' || block.type === 'accessory') || block.slots.length > 0,
    );
  return {
    ...session,
    blocks,
    estMinutes: blocks.reduce((sum, block) => sum + block.estMinutes, 0),
  };
};

/** Scale prescribed sets and remove low-load conditioning finishers. */
export const scalePlanLoad = (plan: WeeklyPlan, loadIndex: number): WeeklyPlan => {
  const days: PlanDay[] = plan.days.map((day) => {
    const sessions: PlanSession[] = day.sessions.map((session) =>
      session.kind === 'training' ? scaleTrainingSession(session, loadIndex) : session,
    );
    return {
      ...day,
      sessions,
      estMinutes: sessions.reduce((sum, session) => sum + session.estMinutes, 0),
    };
  });
  return { ...plan, days, loadIndex };
};

const generateBaseline = (input: ProgramGenerationInput): readonly ProgramWeek[] => {
  const curve = curveFor(input);
  const result = generatePlan(input);
  if (!result.ok) throw result.error;
  const basePlan = result.value;
  return Array.from({ length: input.weeks }, (_unused, weekIndex) => {
    const { kind, loadIndex } = baselineLoadIndex(weekIndex, curve);
    return {
      weekStart: weekAfter(input.startWeek, weekIndex),
      weekIndex,
      kind,
      loadIndex,
      plan: withMetadata(
        clonePlanIds(scalePlanLoad(basePlan, loadIndex)),
        weekIndex,
        kind,
        loadIndex,
      ),
    };
  });
};

/** Generate a complete consecutive program from one weekly input. */
export const generateProgram = (input: ProgramGenerationInput): TrainingProgram => {
  const parsed = { ...input, curve: curveFor(input) };
  const baselineWeeks = generateBaseline(parsed);
  const firstPlan = baselineWeeks[0]!.plan!;
  return {
    startWeek: input.startWeek,
    weekCount: input.weeks,
    input: parsed,
    basePlan: scalePlanLoad(firstPlan, 1),
    weeks: baselineWeeks,
    baselineWeeks,
  };
};

const capIndex = (
  template: WeeklyPlan,
  templateLoadIndex: number,
  target: number,
  previousLoads: readonly number[],
  maxAcwr: number,
): number => {
  const chronic = chronicLoad(previousLoads);
  if (chronic === 0) return target;
  const scale = (index: number): WeeklyPlan =>
    scalePlanLoad(template, index / Math.max(templateLoadIndex, Number.EPSILON));
  const targetLoad = planLoadUnits(scale(target));
  if (acuteChronicRatio(targetLoad, previousLoads) <= maxAcwr) return target;
  const maxLoad = chronic * maxAcwr;
  let low = 0;
  let high = target;
  for (let i = 0; i < 24; i += 1) {
    const middle = (low + high) / 2;
    if (planLoadUnits(scale(middle)) <= maxLoad) low = middle;
    else high = middle;
  }
  return low;
};

/**
 * Recompute all weeks at/after `todayWeek`, inserting zero-load breaks and
 * shifting the remaining baseline weeks. Baseline weeks before the anchor
 * are copied unchanged.
 */
export const replanProgram = ({ program, breakWeeks, todayWeek }: ReplanInput): TrainingProgram => {
  const breakSet = new Set(breakWeeks);
  const curve = curveFor(program.input);
  const past = program.weeks.filter((week) => week.weekStart < todayWeek);
  const usedWeekIndexes = new Set(
    past.flatMap((week) => (week.weekIndex === undefined ? [] : [week.weekIndex])),
  );
  const futureBaseline = program.baselineWeeks.filter(
    (week) => week.weekIndex !== undefined && !usedWeekIndexes.has(week.weekIndex),
  );
  const output: ProgramWeek[] = [...past];
  const previousLoads = past.map((week) =>
    week.plan === undefined ? 0 : planLoadUnits(week.plan),
  );
  let baselinePosition = 0;
  let calendarWeek = todayWeek;
  while (baselinePosition < futureBaseline.length || breakSet.has(calendarWeek)) {
    if (breakSet.has(calendarWeek)) {
      output.push({
        weekStart: calendarWeek,
        kind: 'break',
        loadIndex: 0,
      });
      previousLoads.push(0);
    } else {
      const baseline = futureBaseline[baselinePosition] as ProgramWeek;
      baselinePosition += 1;
      const baselineIndex = baseline.weekIndex as number;
      const afterBreak = output.at(-1)?.kind === 'break';
      const kind = afterBreak && baseline.kind === 'deload' ? 'train' : baseline.kind;
      const target =
        afterBreak && baseline.kind === 'deload'
          ? 1 + (baselineIndex % curve.deloadEvery) * curve.weeklyIncrement
          : baseline.loadIndex;
      const template = program.basePlan;
      const loadIndex = Math.max(
        curve.deloadLoadIndex,
        capIndex(template, 1, target, previousLoads, curve.maxAcwr),
      );
      const scaled = scalePlanLoad(template, loadIndex);
      const plan = withMetadata(
        rekeyPlanIds(scaled, baseline.plan as WeeklyPlan),
        baselineIndex,
        kind,
        loadIndex,
      );
      output.push({
        weekStart: calendarWeek,
        weekIndex: baselineIndex,
        kind,
        loadIndex,
        plan,
      });
      previousLoads.push(planLoadUnits(plan));
    }
    calendarWeek = weekAfter(calendarWeek, 1);
  }
  return { ...program, weeks: output };
};
