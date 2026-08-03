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

const recommendationCount = (minutes: number): number =>
  minutes <= 0 ? 0 : Math.min(4, Math.max(1, Math.floor(minutes / 3)));

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const slotsIn = (blocks: readonly SessionBlock[]): readonly ExerciseSlot[] =>
  blocks.flatMap((block) => block.slots);

const warmupRecommendations = (
  blocks: readonly SessionBlock[],
  minutes: number,
): readonly DrillRecommendation[] => {
  const patterns = unique(
    slotsIn(blocks)
      .map((slot) => getExercise(slot.exerciseSlug)?.pattern)
      .filter((pattern): pattern is MovementPattern => pattern !== undefined),
  );
  const ordered = WARMUP_ORDER.filter((pattern) => patterns.includes(pattern));
  return ordered
    .slice(0, recommendationCount(minutes))
    .map((pattern) => WARMUP_BY_PATTERN[pattern]);
};

const cooldownRecommendations = (
  blocks: readonly SessionBlock[],
  minutes: number,
): readonly DrillRecommendation[] => {
  const muscles = unique(slotsIn(blocks).flatMap((slot) => slot.primaryMuscles));
  return muscles.slice(0, recommendationCount(minutes)).map((muscle) => COOLDOWN_BY_MUSCLE[muscle]);
};

/** Recompute preparation/recovery recommendations from the current slots. */
export const deriveSessionRecommendations = (
  blocks: readonly SessionBlock[],
): readonly SessionBlock[] =>
  blocks.map((block) => {
    const recommendations =
      block.type === 'warmup'
        ? warmupRecommendations(blocks, block.estMinutes)
        : block.type === 'cooldown'
          ? cooldownRecommendations(blocks, block.estMinutes)
          : undefined;
    if (recommendations === undefined) return block;
    if (recommendations.length > 0) return { ...block, recommendations };
    const { recommendations: _old, ...rest } = block;
    return rest;
  });
