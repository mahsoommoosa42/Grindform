import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newSessionId, newUserId } from '@grindform/core';
import type { UserId } from '@grindform/core';

import type { Db } from '../src/client.ts';
import {
  createSession,
  findSessionByTokenHash,
  revokeAllSessionsForUser,
  revokeSession,
} from '../src/repos/sessions-repo.ts';
import { createUser } from '../src/repos/users-repo.ts';
import { freshDb } from './helpers/db.ts';

const expiresAt = new Date(Date.now() + 60_000);

describe('sessions-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;
  let userId: UserId;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
    const user = await createUser(db, {
      id: newUserId(),
      email: 'gargi@example.com',
      passwordHash: '$scrypt$fake',
      role: 'member',
      status: 'active',
      termsAcceptedAt: new Date(),
    });
    userId = user.id;
  });
  afterEach(async () => {
    await dispose();
  });

  it('creates a session and finds it by token hash', async () => {
    const created = await createSession(db, {
      id: newSessionId(),
      userId,
      tokenHash: 'hash-a',
      userAgent: 'jsdom',
      ipAddress: '127.0.0.1',
      expiresAt,
    });
    expect(created.revokedAt).toBeNull();
    expect((await findSessionByTokenHash(db, 'hash-a'))?.id).toBe(created.id);
    expect(await findSessionByTokenHash(db, 'missing')).toBeUndefined();
  });

  it('revokes a single session idempotently', async () => {
    const created = await createSession(db, {
      id: newSessionId(),
      userId,
      tokenHash: 'hash-b',
      userAgent: null,
      ipAddress: null,
      expiresAt,
    });
    await revokeSession(db, created.id);
    const first = (await findSessionByTokenHash(db, 'hash-b'))?.revokedAt;
    expect(first).toBeInstanceOf(Date);
    await revokeSession(db, created.id);
    expect((await findSessionByTokenHash(db, 'hash-b'))?.revokedAt?.toISOString()).toBe(
      first?.toISOString(),
    );
  });

  it('revokes every live session for a user', async () => {
    await createSession(db, {
      id: newSessionId(),
      userId,
      tokenHash: 'hash-c',
      userAgent: null,
      ipAddress: null,
      expiresAt,
    });
    await createSession(db, {
      id: newSessionId(),
      userId,
      tokenHash: 'hash-d',
      userAgent: null,
      ipAddress: null,
      expiresAt,
    });
    await revokeAllSessionsForUser(db, userId);
    expect((await findSessionByTokenHash(db, 'hash-c'))?.revokedAt).toBeInstanceOf(Date);
    expect((await findSessionByTokenHash(db, 'hash-d'))?.revokedAt).toBeInstanceOf(Date);
  });
});
