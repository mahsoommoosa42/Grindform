/**
 * Deterministic preparation and recovery recommendations for generated
 * training sessions. These are deliberately separate from exercise slots:
 * they are guidance, not load-bearing or trackable prescriptions.
 */

import { getExercise } from '@grindform/catalog';
import type { MuscleGroup, MovementPattern } from '@grindform/core';

import type { DrillRecommendation, ExerciseSlot, SessionBlock } from './types.ts';

type DoseSpec =
  | {
      readonly kind: 'sets';
      readonly base: number;
      readonly increment: number;
      readonly cap: number;
      readonly reps: string;
    }
  | {
      readonly kind: 'seconds';
      readonly base: number;
      readonly increment: number;
      readonly suffix: string;
    }
  | {
      readonly kind: 'minutes';
      readonly base: number;
      readonly increment: number;
      readonly suffix: string;
    };

interface RecommendationTemplate {
  readonly name: string;
  readonly dose: DoseSpec;
  readonly reason: string;
}

const sets = (reps: string): DoseSpec => ({
  kind: 'sets',
  base: 1,
  increment: 1,
  cap: 3,
  reps,
});

const seconds = (base: number, suffix = ''): DoseSpec => ({
  kind: 'seconds',
  base,
  increment: 15,
  suffix,
});

const minutes = (base: number, suffix = ''): DoseSpec => ({
  kind: 'minutes',
  base,
  increment: 1,
  suffix,
});

const WARMUP_BY_PATTERN: Readonly<Record<MovementPattern, RecommendationTemplate>> = {
  conditioning: {
    name: 'Easy pulse raiser',
    dose: minutes(2),
    reason: 'Raises your heart rate before conditioning work.',
  },
  core: {
    name: 'Dead bug',
    dose: sets('8 each side'),
    reason: 'Braces and prepares your core for trunk work.',
  },
  squat: {
    name: 'Bodyweight squat',
    dose: sets('8'),
    reason: 'Rehearses the squat pattern for your lower-body lifts.',
  },
  hinge: {
    name: 'Hip hinge drill',
    dose: sets('8'),
    reason: 'Preps your hips and hamstrings for hinge work.',
  },
  lunge: {
    name: 'Reverse lunge',
    dose: sets('6 each side'),
    reason: 'Preps single-leg control for your lunge work.',
  },
  horizontal_push: {
    name: 'Incline push-up',
    dose: sets('6'),
    reason: 'Warms your chest and shoulders for horizontal pressing.',
  },
  vertical_push: {
    name: 'Wall slide',
    dose: sets('8'),
    reason: 'Preps shoulder mobility for overhead pressing.',
  },
  horizontal_pull: {
    name: 'Band row',
    dose: sets('8'),
    reason: 'Activates your back for horizontal pulling.',
  },
  vertical_pull: {
    name: 'Band pulldown',
    dose: sets('8'),
    reason: 'Activates your back and shoulders for vertical pulling.',
  },
  carry: {
    name: 'Marching carry',
    dose: sets('20 steps'),
    reason: 'Preps your trunk and grip for loaded carries.',
  },
  isolation: {
    name: 'Dynamic arm circles',
    dose: seconds(60),
    reason: 'Gently warms the joints around your isolation work.',
  },
};

const COOLDOWN_BY_MUSCLE: Readonly<Record<MuscleGroup, RecommendationTemplate>> = {
  glutes: {
    name: 'Figure-four stretch',
    dose: seconds(30, ' each side'),
    reason: 'Releases the glutes trained today.',
  },
  hamstrings: {
    name: 'Hamstring stretch',
    dose: seconds(30, ' each side'),
    reason: 'Releases the hamstrings trained today.',
  },
  quads: {
    name: 'Standing quad stretch',
    dose: seconds(30, ' each side'),
    reason: 'Releases the quads trained today.',
  },
  calves: {
    name: 'Calf stretch',
    dose: seconds(30, ' each side'),
    reason: 'Releases the calves trained today.',
  },
  back: {
    name: 'Child’s pose',
    dose: seconds(45),
    reason: 'Unloads the back trained today.',
  },
  chest: {
    name: 'Doorway chest stretch',
    dose: seconds(30, ' each side'),
    reason: 'Opens the chest trained today.',
  },
  shoulders: {
    name: 'Cross-body shoulder stretch',
    dose: seconds(30, ' each side'),
    reason: 'Releases the shoulders trained today.',
  },
  biceps: {
    name: 'Biceps wall stretch',
    dose: seconds(30, ' each side'),
    reason: 'Releases the biceps trained today.',
  },
  triceps: {
    name: 'Overhead triceps stretch',
    dose: seconds(30, ' each side'),
    reason: 'Releases the triceps trained today.',
  },
  core: {
    name: 'Cobra stretch',
    dose: seconds(30),
    reason: 'Lengthens the trunk after core work.',
  },
  full_body: {
    name: 'Easy walk',
    dose: minutes(2),
    reason: 'Brings your heart rate down after full-body work.',
  },
};

const WARMUP_ORDER: readonly MovementPattern[] = [
  'conditioning',
  'core',
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'isolation',
];

const liftSlotsIn = (blocks: readonly SessionBlock[]): readonly ExerciseSlot[] =>
  blocks
    .filter((block) => block.type === 'main' || block.type === 'accessory')
    .flatMap((block) => block.slots)
    .filter((slot) => getExercise(slot.exerciseSlug)?.role !== 'conditioning');

const formatDose = (dose: DoseSpec, liftCount: number): string => {
  const quantity = dose.base + dose.increment * (liftCount - 1);
  switch (dose.kind) {
    case 'sets':
      return `${Math.min(dose.cap, quantity)} × ${dose.reps}`;
    case 'seconds':
      return `${quantity} s${dose.suffix}`;
    case 'minutes':
      return `${quantity} min${dose.suffix}`;
  }
};

const recommendationFor = (
  recommendation: RecommendationTemplate,
  liftCount: number,
): DrillRecommendation => ({
  name: recommendation.name,
  dose: formatDose(recommendation.dose, liftCount),
  reason: recommendation.reason,
});

const warmupRecommendations = (
  blocks: readonly SessionBlock[],
  timeBudgetMinutes: number,
): readonly DrillRecommendation[] => {
  if (timeBudgetMinutes <= 0) return [];
  const patternCounts = new Map<MovementPattern, number>();
  for (const slot of liftSlotsIn(blocks)) {
    const pattern = getExercise(slot.exerciseSlug)?.pattern;
    if (pattern !== undefined) patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
  }
  return WARMUP_ORDER.flatMap((pattern) => {
    const liftCount = patternCounts.get(pattern);
    return liftCount === undefined
      ? []
      : [recommendationFor(WARMUP_BY_PATTERN[pattern], liftCount)];
  });
};

const cooldownRecommendations = (
  blocks: readonly SessionBlock[],
  timeBudgetMinutes: number,
  focus: readonly MuscleGroup[],
): readonly DrillRecommendation[] => {
  if (timeBudgetMinutes <= 0) return [];
  const muscleCounts = new Map<MuscleGroup, number>();
  for (const slot of liftSlotsIn(blocks)) {
    for (const muscle of slot.primaryMuscles) {
      muscleCounts.set(muscle, (muscleCounts.get(muscle) ?? 0) + 1);
    }
  }
  const muscles = [...muscleCounts.entries()];
  const prioritized = [
    ...muscles.filter(([muscle]) => focus.includes(muscle)),
    ...muscles.filter(([muscle]) => !focus.includes(muscle)),
  ];
  return prioritized.map(([muscle, liftCount]) =>
    recommendationFor(COOLDOWN_BY_MUSCLE[muscle], liftCount),
  );
};

/** Recompute preparation/recovery recommendations from the current slots. */
export const deriveSessionRecommendations = (
  blocks: readonly SessionBlock[],
  focus: readonly MuscleGroup[] = [],
): readonly SessionBlock[] =>
  blocks.map((block) => {
    const recommendations =
      block.type === 'warmup'
        ? warmupRecommendations(blocks, block.estMinutes)
        : block.type === 'cooldown'
          ? cooldownRecommendations(blocks, block.estMinutes, focus)
          : undefined;
    if (recommendations === undefined) return block;
    if (recommendations.length > 0) return { ...block, recommendations };
    const { recommendations: _old, ...rest } = block;
    return rest;
  });
