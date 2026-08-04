/**
 * Deterministic preparation and recovery recommendations for generated
 * training sessions. These are deliberately separate from exercise slots:
 * they are guidance, not load-bearing or trackable prescriptions.
 */

import { getExercise } from '@grindform/catalog';
import type { MuscleGroup, MovementPattern } from '@grindform/core';

import type { DrillRecommendation, ExerciseSlot, SessionBlock } from './types.ts';

const WARMUP_BY_PATTERN: Readonly<Record<MovementPattern, DrillRecommendation>> = {
  conditioning: {
    name: 'Easy pulse raiser',
    dose: '2 min',
    reason: 'Raises your heart rate before conditioning work.',
  },
  core: {
    name: 'Dead bug',
    dose: '2 × 8 each side',
    reason: 'Braces and prepares your core for trunk work.',
  },
  squat: {
    name: 'Bodyweight squat',
    dose: '2 × 8',
    reason: 'Rehearses the squat pattern for your lower-body lifts.',
  },
  hinge: {
    name: 'Hip hinge drill',
    dose: '2 × 8',
    reason: 'Preps your hips and hamstrings for hinge work.',
  },
  lunge: {
    name: 'Reverse lunge',
    dose: '2 × 6 each side',
    reason: 'Preps single-leg control for your lunge work.',
  },
  horizontal_push: {
    name: 'Incline push-up',
    dose: '2 × 6',
    reason: 'Warms your chest and shoulders for horizontal pressing.',
  },
  vertical_push: {
    name: 'Wall slide',
    dose: '2 × 8',
    reason: 'Preps shoulder mobility for overhead pressing.',
  },
  horizontal_pull: {
    name: 'Band row',
    dose: '2 × 8',
    reason: 'Activates your back for horizontal pulling.',
  },
  vertical_pull: {
    name: 'Band pulldown',
    dose: '2 × 8',
    reason: 'Activates your back and shoulders for vertical pulling.',
  },
  carry: {
    name: 'Marching carry',
    dose: '2 × 20 steps',
    reason: 'Preps your trunk and grip for loaded carries.',
  },
  isolation: {
    name: 'Dynamic arm circles',
    dose: '60 s',
    reason: 'Gently warms the joints around your isolation work.',
  },
};

const COOLDOWN_BY_MUSCLE: Readonly<Record<MuscleGroup, DrillRecommendation>> = {
  glutes: {
    name: 'Figure-four stretch',
    dose: '30 s each side',
    reason: 'Releases the glutes trained today.',
  },
  hamstrings: {
    name: 'Hamstring stretch',
    dose: '30 s each side',
    reason: 'Releases the hamstrings trained today.',
  },
  quads: {
    name: 'Standing quad stretch',
    dose: '30 s each side',
    reason: 'Releases the quads trained today.',
  },
  calves: {
    name: 'Calf stretch',
    dose: '30 s each side',
    reason: 'Releases the calves trained today.',
  },
  back: {
    name: 'Child’s pose',
    dose: '45 s',
    reason: 'Unloads the back trained today.',
  },
  chest: {
    name: 'Doorway chest stretch',
    dose: '30 s each side',
    reason: 'Opens the chest trained today.',
  },
  shoulders: {
    name: 'Cross-body shoulder stretch',
    dose: '30 s each side',
    reason: 'Releases the shoulders trained today.',
  },
  biceps: {
    name: 'Biceps wall stretch',
    dose: '30 s each side',
    reason: 'Releases the biceps trained today.',
  },
  triceps: {
    name: 'Overhead triceps stretch',
    dose: '30 s each side',
    reason: 'Releases the triceps trained today.',
  },
  core: {
    name: 'Cobra stretch',
    dose: '30 s',
    reason: 'Lengthens the trunk after core work.',
  },
  full_body: {
    name: 'Easy walk',
    dose: '2 min',
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

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const liftSlotsIn = (blocks: readonly SessionBlock[]): readonly ExerciseSlot[] =>
  blocks
    .filter((block) => block.type === 'main' || block.type === 'accessory')
    .flatMap((block) => block.slots)
    .filter((slot) => getExercise(slot.exerciseSlug)?.role !== 'conditioning');

const doseForLiftCount = (recommendation: DrillRecommendation, liftCount: number) => {
  const sets = recommendation.dose.match(/^2 × (.+)$/);
  let dose = recommendation.dose;
  if (sets !== null) {
    dose = `${Math.min(3, liftCount)} × ${sets[1]}`;
  } else {
    const seconds = recommendation.dose.match(/^(\d+) s(.*)$/);
    if (seconds !== null) {
      dose = `${Number(seconds[1]) + (liftCount - 1) * 15} s${seconds[2]}`;
    } else {
      const minutes = recommendation.dose.match(/^(\d+) min$/);
      if (minutes !== null) dose = `${Number(minutes[1]) + liftCount - 1} min`;
    }
  }
  return { ...recommendation, dose };
};

const warmupRecommendations = (
  blocks: readonly SessionBlock[],
  minutes: number,
): readonly DrillRecommendation[] => {
  if (minutes <= 0) return [];
  const patternCounts = new Map<MovementPattern, number>();
  for (const slot of liftSlotsIn(blocks)) {
    const pattern = getExercise(slot.exerciseSlug)?.pattern;
    if (pattern !== undefined) patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
  }
  return WARMUP_ORDER.filter((pattern) => patternCounts.has(pattern)).map((pattern) =>
    doseForLiftCount(WARMUP_BY_PATTERN[pattern], patternCounts.get(pattern) as number),
  );
};

const cooldownRecommendations = (
  blocks: readonly SessionBlock[],
  minutes: number,
  focus: readonly MuscleGroup[],
): readonly DrillRecommendation[] => {
  if (minutes <= 0) return [];
  const muscleCounts = new Map<MuscleGroup, number>();
  for (const slot of liftSlotsIn(blocks)) {
    for (const muscle of slot.primaryMuscles) {
      muscleCounts.set(muscle, (muscleCounts.get(muscle) ?? 0) + 1);
    }
  }
  const muscles = [...muscleCounts.keys()];
  const prioritized = unique([...focus.filter((muscle) => muscles.includes(muscle)), ...muscles]);
  return prioritized.map((muscle) =>
    doseForLiftCount(COOLDOWN_BY_MUSCLE[muscle], muscleCounts.get(muscle) as number),
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
