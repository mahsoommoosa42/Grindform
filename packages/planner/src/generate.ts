/**
 * @file packages/planner/src/generate.ts
 *
 * The weekly-plan generator. Given a validated {@link GeneratePlanInput}
 * it produces a 7-(or fewer-)day {@link WeeklyPlan}: blocked preplanned
 * days are passed through untouched, while training days are filled with
 * a main lift or two plus accessories sized to the per-session time
 * budget, honouring the chosen goal, equipment, and experience level.
 *
 * Generation is deterministic given `input.seed`, so the same input
 * always yields the same plan and a "boredom swap" is just a new seed.
 */

import { exercisesForMuscle } from '@grindform/catalog';
import type { Exercise } from '@grindform/catalog';
import {
  err,
  newDayId,
  newPlanId,
  newPlanSessionId,
  newSlotId,
  ok,
  ValidationError,
} from '@grindform/core';
import type {
  DaySpec,
  ExerciseRole,
  ExternalSessionSpec,
  GeneratePlanInput,
  MuscleGroup,
  Result,
  TimeBudget,
  TrainingSessionSpec,
} from '@grindform/core';

import { estimateSlotMinutes, GOAL_PROFILES, schemeForRole } from './profiles.ts';
import type { GoalProfile } from './profiles.ts';
import { makeRng } from './rng.ts';
import type { Rng } from './rng.ts';
import type {
  ExerciseSlot,
  ExternalSession,
  PlanDay,
  PlanSession,
  SessionBlock,
  TrainingSession,
  WeeklyPlan,
} from './types.ts';

/** Fraction of working time loosely reserved for the main lift(s). */
const MAIN_TIME_SHARE = 0.45;

/** Hard cap on accessory slots regardless of available time. */
const MAX_ACCESSORIES = 6;

const WARMUP_NOTE =
  'Raise the heart rate, then dynamic mobility for the muscles you are about to train.';
const PHYSIO_NOTE =
  'Your prescribed physio / prehab routine — protect the joint first, train second.';
const COOLDOWN_NOTE = 'Easy walk to bring the heart rate down, then static stretching.';

/** Build one exercise slot, carrying the cue across when present. */
const makeSlot = (profile: GoalProfile, e: Exercise, role: ExerciseRole): ExerciseSlot => {
  const scheme = schemeForRole(profile, role, e.unilateral);
  const base = {
    id: newSlotId(),
    exerciseSlug: e.slug,
    name: e.name,
    scheme,
    primaryMuscles: e.primaryMuscles,
    // Main lifts default to a pyramid (weight up, reps down); the lifter
    // can switch back to straight sets in the tracker.
    ...(role === 'main' ? { pyramid: true } : {}),
  };
  return e.cue === undefined ? base : { ...base, cue: e.cue };
};

/** Group labels for supersets, in assignment order. */
const SUPERSET_GROUPS = 'ABCDEFGH';

/**
 * Pair consecutive accessory slots into supersets (A1/A2, B1/B2, …).
 * A trailing odd slot is left on its own (no superset ref).
 */
const assignSupersets = (slots: readonly ExerciseSlot[]): ExerciseSlot[] => {
  const pairCount = Math.floor(slots.length / 2);
  return slots.map((slot, i) => {
    const pairIndex = Math.floor(i / 2);
    if (pairIndex >= pairCount) return slot;
    return {
      ...slot,
      superset: { group: SUPERSET_GROUPS[pairIndex] as string, order: (i % 2) + 1 },
    };
  });
};

/**
 * Pick the first not-yet-used candidate, starting from an offset that
 * depends on the A/B variation and the seeded RNG. Returns `undefined`
 * only when every candidate is already used (or the list is empty).
 */
const pickExercise = (
  candidates: readonly Exercise[],
  used: ReadonlySet<string>,
  variation: 'A' | 'B',
  rng: Rng,
): Exercise | undefined => {
  if (candidates.length === 0) return undefined;
  const start = ((variation === 'B' ? 1 : 0) + rng.int(candidates.length)) % candidates.length;
  const ordered = [...candidates.slice(start), ...candidates.slice(0, start)];
  return ordered.find((c) => !used.has(c.slug));
};

/**
 * The non-physio block types in their fixed session order. The physio
 * block is inserted relative to these, so `physioPosition` p means "after
 * the first p of these block types that are present".
 */
const REFERENCE_ORDER = ['warmup', 'main', 'accessory', 'cooldown'] as const;

/** Build the optional physio block, or `undefined` when disabled. */
const physioBlock = (physioMinutes: number): SessionBlock | undefined =>
  physioMinutes > 0
    ? { type: 'physio', title: 'Physio', estMinutes: physioMinutes, slots: [], note: PHYSIO_NOTE }
    : undefined;

/**
 * Insert the physio block among the assembled session blocks at the
 * anchor chosen by `physioPosition` (0–4). The anchor is expressed
 * relative to block *types*, so it stays well-defined even when some
 * blocks are absent (e.g. no warm-up): physio still lands "after the
 * warm-up slot" by counting how many preceding reference types exist.
 */
const insertPhysio = (
  blocks: readonly SessionBlock[],
  physio: SessionBlock | undefined,
  physioPosition: number,
): SessionBlock[] => {
  if (physio === undefined) return [...blocks];
  const preceding = new Set(REFERENCE_ORDER.slice(0, physioPosition));
  const index = blocks.filter((b) =>
    preceding.has(b.type as (typeof REFERENCE_ORDER)[number]),
  ).length;
  return [...blocks.slice(0, index), physio, ...blocks.slice(index)];
};

/** Sum estimated minutes across a slot list. */
const sumSlotMinutes = (slots: readonly ExerciseSlot[]): number =>
  slots.reduce((acc, s) => acc + estimateSlotMinutes(s.scheme), 0);

/** Select the main lift(s) for the day's focus muscles. */
const selectMains = (
  focus: readonly MuscleGroup[],
  profile: GoalProfile,
  input: GeneratePlanInput,
  workingMinutes: number,
  used: Set<string>,
  rng: Rng,
): ExerciseSlot[] => {
  const mains: ExerciseSlot[] = [];
  let minutes = 0;
  for (const muscle of focus) {
    if (mains.length >= 1 && minutes >= workingMinutes * MAIN_TIME_SHARE) break;
    const candidates = exercisesForMuscle(muscle, {
      role: 'main',
      equipment: input.equipment,
      experience: input.experience,
    });
    const pick = pickExercise(candidates, used, input.variation, rng);
    if (pick !== undefined) {
      const slot = makeSlot(profile, pick, 'main');
      mains.push(slot);
      used.add(pick.slug);
      minutes += estimateSlotMinutes(slot.scheme);
    }
  }
  return mains;
};

/** Fill accessory slots round-robin across the focus muscles. */
const selectAccessories = (
  focus: readonly MuscleGroup[],
  profile: GoalProfile,
  input: GeneratePlanInput,
  workingMinutes: number,
  usedMinutes: number,
  used: Set<string>,
  rng: Rng,
): ExerciseSlot[] => {
  const slots: ExerciseSlot[] = [];
  let minutes = usedMinutes;
  let cursor = 0;
  let misses = 0;
  const cap = Math.min(profile.accessoryTarget, MAX_ACCESSORIES);
  while (slots.length < cap && minutes < workingMinutes && misses < focus.length) {
    const muscle = focus[cursor % focus.length] as MuscleGroup;
    cursor += 1;
    const candidates = exercisesForMuscle(muscle, {
      equipment: input.equipment,
      experience: input.experience,
    }).filter((c) => c.role !== 'main');
    const pick = pickExercise(candidates, used, input.variation, rng);
    if (pick === undefined) {
      misses += 1;
      continue;
    }
    misses = 0;
    const slot = makeSlot(profile, pick, pick.role);
    slots.push(slot);
    used.add(pick.slug);
    minutes += estimateSlotMinutes(slot.scheme);
  }
  return slots;
};

/** Optionally append a conditioning finisher for fat-loss / endurance goals. */
const selectConditioning = (
  profile: GoalProfile,
  input: GeneratePlanInput,
  used: Set<string>,
  rng: Rng,
): ExerciseSlot | undefined => {
  if (!profile.includeConditioning) return undefined;
  const candidates = exercisesForMuscle('full_body', {
    role: 'conditioning',
    equipment: input.equipment,
    experience: input.experience,
  });
  const pick = pickExercise(candidates, used, input.variation, rng);
  if (pick === undefined) return undefined;
  used.add(pick.slug);
  return makeSlot(profile, pick, 'conditioning');
};

/**
 * Build a single prescribed training session, or fail if constraints
 * leave it empty. Uses the session's own time-budget override when
 * present, otherwise the plan default, so different sessions can run for
 * different lengths and place their physio block independently.
 */
const buildTrainingSession = (
  spec: TrainingSessionSpec,
  profile: GoalProfile,
  input: GeneratePlanInput,
  rng: Rng,
): Result<TrainingSession, ValidationError> => {
  const budget: TimeBudget = spec.timeBudget ?? input.timeBudget;
  const { sessionMinutes, warmupMinutes, cooldownMinutes, physioMinutes, physioPosition } = budget;
  const workingMinutes = Math.max(
    0,
    sessionMinutes - warmupMinutes - cooldownMinutes - physioMinutes,
  );
  const used = new Set<string>();

  const mains = selectMains(spec.focus, profile, input, workingMinutes, used, rng);
  const accessories = selectAccessories(
    spec.focus,
    profile,
    input,
    workingMinutes,
    sumSlotMinutes(mains),
    used,
    rng,
  );
  const finisher = selectConditioning(profile, input, used, rng);
  // Pair the accessories into supersets; the conditioning finisher (if any)
  // is performed on its own, so it stays outside the grouping.
  const supersetted = assignSupersets(accessories);
  const accessoryAndFinisher = finisher === undefined ? supersetted : [...supersetted, finisher];

  if (mains.length === 0 && accessoryAndFinisher.length === 0) {
    return err(
      new ValidationError('no exercises match the chosen equipment / experience for this session', {
        focus: spec.focus,
      }),
    );
  }

  const core: SessionBlock[] = [];
  if (warmupMinutes > 0) {
    core.push({
      type: 'warmup',
      title: 'Warm-up',
      estMinutes: warmupMinutes,
      slots: [],
      note: WARMUP_NOTE,
    });
  }
  if (mains.length > 0) {
    core.push({
      type: 'main',
      title: 'Main lift',
      estMinutes: sumSlotMinutes(mains),
      slots: mains,
    });
  }
  if (accessoryAndFinisher.length > 0) {
    core.push({
      type: 'accessory',
      title: 'Accessories',
      estMinutes: sumSlotMinutes(accessoryAndFinisher),
      slots: accessoryAndFinisher,
    });
  }
  if (cooldownMinutes > 0) {
    core.push({
      type: 'cooldown',
      title: 'Cool-down',
      estMinutes: cooldownMinutes,
      slots: [],
      note: COOLDOWN_NOTE,
    });
  }

  const blocks = insertPhysio(core, physioBlock(physioMinutes), physioPosition);
  const estMinutes = blocks.reduce((acc, b) => acc + b.estMinutes, 0);
  const session: TrainingSession = {
    id: newPlanSessionId(),
    kind: 'training',
    focus: spec.focus,
    blocks,
    estMinutes,
    ...(spec.label === undefined ? {} : { label: spec.label }),
  };
  return ok(session);
};

/** Build a self-tracked external session (run, swim, physio, …). */
const buildExternalSession = (spec: ExternalSessionSpec): ExternalSession => ({
  id: newPlanSessionId(),
  kind: 'external',
  activity: spec.activity,
  plannedMinutes: spec.plannedMinutes,
  estMinutes: spec.plannedMinutes,
  ...(spec.label === undefined ? {} : { label: spec.label }),
});

/** Build a day from its session specs, failing if a training session can't be filled. */
const buildDay = (
  spec: DaySpec,
  profile: GoalProfile,
  input: GeneratePlanInput,
  rng: Rng,
): Result<PlanDay, ValidationError> => {
  const sessions: PlanSession[] = [];
  for (const sessionSpec of spec.sessions) {
    if (sessionSpec.kind === 'external') {
      sessions.push(buildExternalSession(sessionSpec));
      continue;
    }
    const built = buildTrainingSession(sessionSpec, profile, input, rng);
    if (!built.ok) return built;
    sessions.push(built.value);
  }
  const estMinutes = sessions.reduce((acc, s) => acc + s.estMinutes, 0);
  const day: PlanDay = {
    id: newDayId(),
    weekday: spec.weekday,
    sessions,
    estMinutes,
    ...(spec.label === undefined ? {} : { label: spec.label }),
  };
  return ok(day);
};

/**
 * Generate a full weekly plan from validated input.
 *
 * Returns `Err(ValidationError)` if any training session cannot be filled
 * given the equipment / experience constraints; otherwise `Ok(plan)`.
 */
export const generatePlan = (input: GeneratePlanInput): Result<WeeklyPlan, ValidationError> => {
  const profile = GOAL_PROFILES[input.goal];
  const rng = makeRng(input.seed ?? 0);
  const days: PlanDay[] = [];

  for (const spec of input.days) {
    const built = buildDay(spec, profile, input, rng);
    if (!built.ok) return built;
    days.push(built.value);
  }

  return ok({
    id: newPlanId(),
    goal: input.goal,
    experience: input.experience,
    variation: input.variation,
    timeBudget: input.timeBudget,
    days,
  });
};
