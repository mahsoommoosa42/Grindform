import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newUserId } from '@grindform/core';

import type { Db } from '../src/client.ts';
import { getSettings, upsertSettings } from '../src/repos/settings-repo.ts';
import { freshDb } from './helpers/db.ts';

describe('settings-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('returns undefined before any settings are saved', async () => {
    expect(await getSettings(db, newUserId())).toBeUndefined();
  });

  it('inserts then updates settings via upsert', async () => {
    const userId = newUserId();
    const inserted = await upsertSettings(db, userId, { theme: 'grind', preferences: { units: 'kg' } });
    expect(inserted.theme).toBe('grind');

    const loaded = await getSettings(db, userId);
    expect(loaded?.theme).toBe('grind');
    expect(loaded?.preferences).toEqual({ units: 'kg' });

    const updated = await upsertSettings(db, userId, {
      theme: 'girlypop',
      preferences: { units: 'lb' },
    });
    expect(updated.theme).toBe('girlypop');

    const reloaded = await getSettings(db, userId);
    expect(reloaded?.theme).toBe('girlypop');
    expect(reloaded?.preferences).toEqual({ units: 'lb' });
  });
});
