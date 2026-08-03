import { describe, expect, it } from 'vitest';

import { newPlanSessionId, newSlotId } from '@grindform/core';
import type { ExerciseSlug } from '@grindform/core';

import { deriveSessionRecommendations } from '../src/recommendations.ts';
import type { ExerciseSlot, SessionBlock } from '../src/types.ts';

const slot = (slug: string, primaryMuscles: ExerciseSlot['primaryMuscles']): ExerciseSlot => ({
  id: newSlotId(),
  exerciseSlug: slug as ExerciseSlug,
  name: slug,
  scheme: { sets: 3, repsLow: 6, repsHigh: 8, restSeconds: 90, perSide: false },
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

  it('scales recommendations to a capped count and derives cooldown muscles', () => {
    const [warmup, main, cooldown] = deriveSessionRecommendations([
      block('warmup', 30),
      block('main', 20, [
        slot('back-squat', ['quads', 'glutes']),
        slot('barbell-bench-press', ['chest']),
        slot('barbell-overhead-press', ['shoulders']),
        slot('barbell-row', ['back']),
        slot('dead-bug', ['core']),
      ]),
      block('cooldown', 12, [
        slot('back-squat', ['quads', 'glutes']),
        slot('barbell-bench-press', ['chest']),
        slot('barbell-row', ['back']),
      ]),
    ]);
    expect(warmup?.recommendations).toHaveLength(4);
    expect(cooldown?.recommendations?.map((item) => item.name)).toEqual([
      'Standing quad stretch',
      'Figure-four stretch',
      'Doorway chest stretch',
      'Cross-body shoulder stretch',
    ]);
    expect(main?.recommendations).toBeUndefined();
  });

  it('prioritizes advertised focus for a single cooldown drill', () => {
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
    expect(cooldown?.recommendations?.map((item) => item.name)).toEqual(['Figure-four stretch']);
  });

  it('handles zero-minute and slotless blocks without creating empty fields', () => {
    const [warmup, cooldown] = deriveSessionRecommendations([
      block('warmup', 0, [], [{ name: 'Old', dose: '1', reason: 'old' }]),
      block('cooldown', 5),
    ]);
    expect(warmup?.recommendations).toBeUndefined();
    expect(cooldown?.recommendations).toBeUndefined();
  });

  it('leaves non-preparation blocks and unknown custom slugs unchanged', () => {
    const physio = block('physio', 5, [], [{ name: 'Keep', dose: '1', reason: 'keep' }]);
    const main = block('main', 5, [slot('custom-example', ['full_body'])]);
    const result = deriveSessionRecommendations([physio, main]);
    expect(result).toEqual([physio, main]);
  });

  it('is pure and does not require a session or external-session data', () => {
    const blocks = [block('warmup', 3, [slot('back-squat', ['quads'])])];
    const first = deriveSessionRecommendations(blocks);
    const second = deriveSessionRecommendations(blocks);
    expect(first).toEqual(second);
    expect(newPlanSessionId()).toMatch(/^pss_/);
  });
});
