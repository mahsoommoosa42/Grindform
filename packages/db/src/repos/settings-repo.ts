/**
 * @file packages/db/src/repos/settings-repo.ts
 *
 * Persistence for per-user settings (theme + free-form preferences).
 * The single-user MVP keys everything on a fixed user id, but the table
 * is already per-user so multi-user is a later additive change.
 */

import { eq } from 'drizzle-orm';

import type { ThemeId, UserId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { settings } from '../schema/tables.ts';

/** A `settings` row as stored/returned. */
export type Settings = typeof settings.$inferSelect;

/** The mutable part of a settings row. */
export interface SettingsPatch {
  readonly theme: ThemeId;
  readonly preferences: Record<string, unknown>;
}

/** Load a user's settings, or `undefined` if none saved yet. */
export const getSettings = async (db: DbOrTx, userId: UserId): Promise<Settings | undefined> => {
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  return row;
};

/** Insert or update a user's settings, returning the stored row. */
export const upsertSettings = async (
  db: DbOrTx,
  userId: UserId,
  patch: SettingsPatch,
): Promise<Settings> => {
  const row: Settings = {
    userId,
    theme: patch.theme,
    preferences: patch.preferences,
    updatedAt: new Date(),
  };
  await db
    .insert(settings)
    .values(row)
    .onConflictDoUpdate({
      target: settings.userId,
      set: { theme: row.theme, preferences: row.preferences, updatedAt: row.updatedAt },
    });
  return row;
};
