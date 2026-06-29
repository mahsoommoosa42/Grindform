import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newUserId } from '@grindform/core';
import type { CustomExerciseId, CustomExerciseInput, UserId } from '@grindform/core';

import type { Db } from '../src/client.ts';
import {
  createCustomExercise,
  deleteCustomExercise,
  getCustomExercise,
  listCustomExercises,
} from '../src/repos/custom-exercises-repo.ts';
import { createUser } from '../src/repos/users-repo.ts';
import { freshDb } from './helpers/db.ts';

const seedUser = async (db: Db): Promise<UserId> => {
  const id = newUserId();
  await createUser(db, {
    id,
    email: `${id}@example.test`,
    passwordHash: 'hash',
    role: 'member',
    status: 'active',
    termsAcceptedAt: new Date(),
  });
  return id;
};

const withCue: CustomExerciseInput = {
  name: 'Banded glute bridge',
  primaryMuscles: ['glutes'],
  secondaryMuscles: ['hamstrings'],
  equipment: ['band'],
  role: 'accessory',
  unilateral: false,
  cue: 'Drive through heels.',
};

const noCue: CustomExerciseInput = {
  name: 'Copenhagen plank',
  primaryMuscles: ['core'],
  secondaryMuscles: [],
  equipment: ['bodyweight'],
  role: 'mobility',
  unilateral: true,
};

describe('custom-exercises-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('creates, lists, and reads back a custom exercise (with and without a cue)', async () => {
    const userId = await seedUser(db);
    const a = await createCustomExercise(db, userId, withCue);
    const b = await createCustomExercise(db, userId, noCue);

    expect(a.id.startsWith('cex_')).toBe(true);
    expect(a.cue).toBe('Drive through heels.');

    const list = await listCustomExercises(db, userId);
    expect(list.map((e) => e.name)).toEqual(['Banded glute bridge', 'Copenhagen plank']);

    const loadedA = await getCustomExercise(db, a.id, userId);
    expect(loadedA?.cue).toBe('Drive through heels.');
    const loadedB = await getCustomExercise(db, b.id, userId);
    expect(loadedB).toBeDefined();
    expect(loadedB?.cue).toBeUndefined();
    expect(loadedB?.unilateral).toBe(true);
  });

  it('scopes reads to the owner (no cross-account access)', async () => {
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const ex = await createCustomExercise(db, owner, withCue);

    expect(await listCustomExercises(db, other)).toEqual([]);
    expect(await getCustomExercise(db, ex.id, other)).toBeUndefined();
  });

  it('deletes only the owner\'s exercise and reports whether a row was removed', async () => {
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const ex = await createCustomExercise(db, owner, withCue);

    // A non-owner cannot delete it.
    expect(await deleteCustomExercise(db, ex.id, other)).toBe(false);
    expect(await getCustomExercise(db, ex.id, owner)).toBeDefined();

    // The owner can.
    expect(await deleteCustomExercise(db, ex.id, owner)).toBe(true);
    expect(await getCustomExercise(db, ex.id, owner)).toBeUndefined();

    // Deleting a non-existent id reports false.
    expect(await deleteCustomExercise(db, 'cex_missing' as CustomExerciseId, owner)).toBe(false);
  });
});
