import { describe, expect, it } from 'vitest';

import { newPlanSessionId, newSlotId } from '@grindform/core';
import type { ExerciseSlug } from '@grindform/core';

import { deriveSessionRecommendations } from '../src/recommendations.ts';
import type { ExerciseSlot, SessionBlock } from '../src/types.ts';

const slot = (
  slug: string,
  primaryMuscles: ExerciseSlot['primaryMuscles'],
  repsHigh = 8,
): ExerciseSlot => ({
  id: newSlotId(),
  exerciseSlug: slug as ExerciseSlug,
  name: slug,
  scheme: { sets: 3, repsLow: 6, repsHigh, restSeconds: 90, perSide: false },
  primaryMuscles,
});

const block = (
  type: SessionBlock['type'],
  estMinutes: number,
  slots: readonly ExerciseSlot[] = [],
  recommendations?: SessionBlock['recommendations'],
): SessionBlock => ({
  type,
  title: type,
  estMinutes,
  slots,
  ...(recommendations === undefined ? {} : { recommendations }),
});

describe('deriveSessionRecommendations', () => {
  it('orders and deduplicates warm-up drills by selected movement pattern', () => {
    const [warmup] = deriveSessionRecommendations([
      block('warmup', 12),
      block('main', 12, [
        slot('back-squat', ['quads', 'glutes']),
        slot('dead-bug', ['core']),
        slot('barbell-hip-thrust', ['glutes']),
      ]),
      block('cooldown', 9, [
        slot('back-squat', ['quads', 'glutes']),
        slot('barbell-hip-thrust', ['glutes']),
      ]),
    ]);
    expect(warmup?.recommendations?.map((item) => item.name)).toEqual([
      'Dead bug',
      'Bodyweight squat',
      'Hip hinge drill',
    ]);
    expect(warmup?.recommendations?.every((item) => item.reason.length > 0)).toBe(true);
  });

  it('derives one drill per pattern and muscle, with lift-count doses', () => {
    const [warmup, main, , cooldown] = deriveSessionRecommendations([
      block('warmup', 30),
      block('main', 20, [
        slot('back-squat', ['quads', 'glutes']),
        slot('back-squat', ['quads']),
        slot('barbell-bench-press', ['chest']),
        slot('overhead-press', ['shoulders']),
        slot('barbell-row', ['back']),
        slot('dead-bug', ['core']),
      ]),
      block('accessory', 20, [slot('back-squat', ['quads'])]),
      block('cooldown', 12, [
        slot('back-squat', ['quads', 'glutes']),
        slot('back-squat', ['quads']),
        slot('barbell-bench-press', ['chest']),
        slot('barbell-row', ['back']),
      ]),
    ]);
    expect(warmup?.recommendations?.map((item) => item.name)).toEqual([
      'Dead bug',
      'Bodyweight squat',
      'Incline push-up',
      'Wall slide',
      'Band row',
    ]);
    expect(warmup?.recommendations?.find((item) => item.name === 'Bodyweight squat')?.dose).toBe(
      '3 × 8',
    );
    expect(cooldown?.recommendations?.map((item) => item.name)).toEqual([
      'Standing quad stretch',
      'Figure-four stretch',
      'Doorway chest stretch',
      'Cross-body shoulder stretch',
      'Child’s pose',
      'Cobra stretch',
    ]);
    expect(
      cooldown?.recommendations?.find((item) => item.name === 'Standing quad stretch')?.dose,
    ).toBe('60 s each side');
    expect(main?.recommendations).toBeUndefined();
  });

  it('prioritizes advertised focus for cooldown ordering', () => {
    const [, , cooldown] = deriveSessionRecommendations(
      [
        block('warmup', 0),
        block('main', 20, [slot('back-squat', ['quads']), slot('barbell-hip-thrust', ['glutes'])]),
        block('cooldown', 5, [
          slot('back-squat', ['quads']),
          slot('barbell-hip-thrust', ['glutes']),
        ]),
      ],
      ['glutes', 'core'],
    );
    expect(cooldown?.recommendations?.map((item) => item.name)).toEqual([
      'Figure-four stretch',
      'Standing quad stretch',
    ]);
  });

  it('handles zero-minute blocks without creating empty fields', () => {
    const [warmup, cooldown] = deriveSessionRecommendations([
      block('warmup', 0, [], [{ name: 'Old', dose: '1', reason: 'old' }]),
      block('cooldown', 0, [], [{ name: 'Old', dose: '1', reason: 'old' }]),
    ]);
    expect(warmup?.recommendations).toBeUndefined();
    expect(cooldown?.recommendations).toBeUndefined();
  });

  it('ignores conditioning and unknown custom patterns while retaining custom muscles', () => {
    const physio = block('physio', 5, [], [{ name: 'Keep', dose: '1', reason: 'keep' }]);
    const warmup = block('warmup', 5);
    const cooldown = block('cooldown', 5);
    const conditioning = block('accessory', 5, [slot('rowing-intervals', ['full_body'], 20)]);
    const custom = block('main', 5, [slot('custom-example', ['full_body'])]);
    const result = deriveSessionRecommendations([physio, warmup, conditioning, custom, cooldown]);
    expect(result[0]).toEqual(physio);
    expect(result[1]?.recommendations).toBeUndefined();
    expect(result[4]?.recommendations?.[0]?.name).toBe('Easy walk');
  });

  it('emits no recommendations for conditioning-only sessions', () => {
    const result = deriveSessionRecommendations([
      block('warmup', 5, [], [{ name: 'Old', dose: '1', reason: 'old' }]),
      block('accessory', 5, [slot('rowing-intervals', ['full_body'], 20)]),
      block('cooldown', 5, [], [{ name: 'Old', dose: '1', reason: 'old' }]),
    ]);
    expect(result[0]?.recommendations).toBeUndefined();
    expect(result[2]?.recommendations).toBeUndefined();
  });

  it('is pure and does not require a session or external-session data', () => {
    const blocks = [block('warmup', 3, [slot('back-squat', ['quads'])])];
    const first = deriveSessionRecommendations(blocks);
    const second = deriveSessionRecommendations(blocks);
    expect(first).toEqual(second);
    expect(newPlanSessionId()).toMatch(/^pss_/);
  });
});
