import { describe, expect, it } from 'vitest';

import { newCustomExerciseId, newDayId, newPlanSessionId, newSlotId } from '@grindform/core';
import type { ExerciseSlug } from '@grindform/core';

import {
  addSlotToSession,
  buildSlot,
  customExerciseSlug,
  removeSlot,
  swapSlotExercise,
} from '../src/mutate.ts';
import type { ResolvedExercise } from '../src/mutate.ts';
import { estimateSlotMinutes, schemeForRole, GOAL_PROFILES } from '../src/profiles.ts';
import type {
  ExerciseSlot,
  ExternalSession,
  PlanDay,
  SessionBlock,
  TrainingSession,
} from '../src/types.ts';

/** A catalog-style resolved exercise (with a cue). */
const squat: ResolvedExercise = {
  slug: 'back-squat' as ExerciseSlug,
  name: 'Back squat',
  primaryMuscles: ['quads', 'glutes'],
  role: 'main',
  unilateral: false,
  cue: 'Brace hard.',
};

/** An accessory exercise with no cue. */
const curl: ResolvedExercise = {
  slug: 'cable-curl' as ExerciseSlug,
  name: 'Cable curl',
  primaryMuscles: ['biceps'],
  role: 'accessory',
  unilateral: false,
};

const lunge: ResolvedExercise = {
  slug: 'lunge' as ExerciseSlug,
  name: 'Walking lunge',
  primaryMuscles: ['glutes'],
  role: 'accessory',
  unilateral: true,
};

const block = (type: SessionBlock['type'], slots: ExerciseSlot[]): SessionBlock => ({
  type,
  title: type,
  estMinutes: type === 'main' || type === 'accessory' ? estimateSlotMinutes(slots[0]?.scheme ?? schemeForRole(GOAL_PROFILES.build_muscle, 'accessory', false)) : 5,
  slots,
});

const training = (blocks: SessionBlock[]): TrainingSession => ({
  id: newPlanSessionId(),
  kind: 'training',
  focus: ['quads'],
  blocks,
  estMinutes: blocks.reduce((a, b) => a + b.estMinutes, 0),
});

const external = (): ExternalSession => ({
  id: newPlanSessionId(),
  kind: 'external',
  activity: 'run',
  plannedMinutes: 30,
  estMinutes: 30,
});

const day = (sessions: PlanDay['sessions']): PlanDay => ({
  id: newDayId(),
  weekday: 'mon',
  sessions,
  estMinutes: sessions.reduce((a, s) => a + s.estMinutes, 0),
});

describe('customExerciseSlug', () => {
  it('synthesises a kebab-case, custom- prefixed slug from a custom id', () => {
    const id = newCustomExerciseId();
    const slug = customExerciseSlug(id);
    expect(slug.startsWith('custom-')).toBe(true);
    expect(slug).toMatch(/^custom-[a-z0-9]+$/);
  });
});

describe('buildSlot', () => {
  it('builds a main-lift slot flagged as a pyramid, carrying the cue', () => {
    const slot = buildSlot('build_muscle', squat);
    expect(slot.exerciseSlug).toBe('back-squat');
    expect(slot.name).toBe('Back squat');
    expect(slot.primaryMuscles).toEqual(['quads', 'glutes']);
    expect(slot.pyramid).toBe(true);
    expect(slot.cue).toBe('Brace hard.');
    expect(slot.id.startsWith('slt_')).toBe(true);
  });

  it('builds an accessory slot with no pyramid and no cue when absent', () => {
    const slot = buildSlot('build_muscle', curl);
    expect(slot.pyramid).toBeUndefined();
    expect(slot.cue).toBeUndefined();
  });
});

describe('swapSlotExercise', () => {
  it('replaces the slot exercise, keeping the slot id, and drops a stale cue', () => {
    const original = buildSlot('build_muscle', squat);
    const d = day([training([block('main', [original])])]);
    const next = swapSlotExercise(d, original.id, curl);
    expect(next).toBeDefined();
    const session = next?.sessions[0] as TrainingSession;
    const slot = session.blocks[0]?.slots[0] as ExerciseSlot;
    expect(slot.id).toBe(original.id);
    expect(slot.exerciseSlug).toBe('cable-curl');
    expect(slot.name).toBe('Cable curl');
    expect(slot.primaryMuscles).toEqual(['biceps']);
    expect(slot.cue).toBeUndefined();
  });

  it('carries over a cue when the swapped-in exercise has one', () => {
    const original = buildSlot('build_muscle', curl);
    const d = day([training([block('accessory', [original])])]);
    const next = swapSlotExercise(d, original.id, squat);
    const session = next?.sessions[0] as TrainingSession;
    expect((session.blocks[0]?.slots[0] as ExerciseSlot).cue).toBe('Brace hard.');
  });

  it('leaves other slots untouched and ignores external sessions', () => {
    const keep = buildSlot('build_muscle', curl);
    const target = buildSlot('build_muscle', squat);
    const d = day([external(), training([block('main', [keep, target])])]);
    const next = swapSlotExercise(d, target.id, lunge);
    const session = next?.sessions[1] as TrainingSession;
    expect((session.blocks[0]?.slots[0] as ExerciseSlot).exerciseSlug).toBe('cable-curl');
    expect((session.blocks[0]?.slots[1] as ExerciseSlot).exerciseSlug).toBe('lunge');
    expect(next?.sessions[0]?.kind).toBe('external');
  });

  it('returns undefined when the slot does not exist', () => {
    const d = day([training([block('main', [buildSlot('build_muscle', squat)])])]);
    expect(swapSlotExercise(d, newSlotId(), curl)).toBeUndefined();
  });
});

describe('addSlotToSession', () => {
  it('appends to an existing accessory block, leaving other blocks/sessions alone', () => {
    const session = training([
      block('main', [buildSlot('build_muscle', squat)]),
      block('accessory', [buildSlot('build_muscle', curl)]),
    ]);
    const d = day([external(), session]);
    const next = addSlotToSession(d, session.id, 'build_muscle', lunge);
    const out = next?.sessions[1] as TrainingSession;
    const accessory = out.blocks.find((b) => b.type === 'accessory');
    expect(accessory?.slots).toHaveLength(2);
    expect(accessory?.slots[1]?.exerciseSlug).toBe('lunge');
    expect(out.blocks.find((b) => b.type === 'main')?.slots).toHaveLength(1);
    expect(next?.sessions[0]?.kind).toBe('external');
  });

  it('creates an accessory block before the cool-down when none exists', () => {
    const session = training([
      block('main', [buildSlot('build_muscle', squat)]),
      block('cooldown', []),
    ]);
    const d = day([session]);
    const next = addSlotToSession(d, session.id, 'build_muscle', curl);
    const out = next?.sessions[0] as TrainingSession;
    expect(out.blocks.map((b) => b.type)).toEqual(['main', 'accessory', 'cooldown']);
  });

  it('appends an accessory block at the end when there is no cool-down', () => {
    const session = training([block('main', [buildSlot('build_muscle', squat)])]);
    const d = day([session]);
    const next = addSlotToSession(d, session.id, 'build_muscle', curl);
    const out = next?.sessions[0] as TrainingSession;
    expect(out.blocks.map((b) => b.type)).toEqual(['main', 'accessory']);
  });

  it('returns undefined for a missing session', () => {
    const d = day([training([block('main', [buildSlot('build_muscle', squat)])])]);
    expect(addSlotToSession(d, newPlanSessionId(), 'build_muscle', curl)).toBeUndefined();
  });

  it('returns undefined when the target session is external', () => {
    const ext = external();
    const d = day([ext]);
    expect(addSlotToSession(d, ext.id, 'build_muscle', curl)).toBeUndefined();
  });
});

describe('removeSlot', () => {
  it('removes a slot but keeps a block that still has slots', () => {
    const keep = buildSlot('build_muscle', curl);
    const drop = buildSlot('build_muscle', lunge);
    const session = training([block('accessory', [keep, drop])]);
    const d = day([session]);
    const next = removeSlot(d, drop.id);
    const out = next?.sessions[0] as TrainingSession;
    expect(out.blocks[0]?.slots).toHaveLength(1);
    expect(out.blocks[0]?.slots[0]?.id).toBe(keep.id);
  });

  it('drops an accessory block left empty after removal', () => {
    const only = buildSlot('build_muscle', curl);
    const session = training([
      block('main', [buildSlot('build_muscle', squat)]),
      block('accessory', [only]),
      block('cooldown', []),
    ]);
    const d = day([external(), session]);
    const next = removeSlot(d, only.id);
    const out = next?.sessions[1] as TrainingSession;
    expect(out.blocks.map((b) => b.type)).toEqual(['main', 'cooldown']);
  });

  it('returns undefined when the slot does not exist', () => {
    const d = day([training([block('main', [buildSlot('build_muscle', squat)])])]);
    expect(removeSlot(d, newSlotId())).toBeUndefined();
  });
});
