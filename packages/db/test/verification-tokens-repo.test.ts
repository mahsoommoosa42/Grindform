import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newUserId, newVerificationTokenId } from '@grindform/core';
import type { UserId } from '@grindform/core';

import type { Db } from '../src/client.ts';
import {
  consumeVerificationToken,
  countActiveTokensForUser,
  createVerificationToken,
  deleteExpiredVerificationTokens,
  deleteVerificationTokensForUser,
  findVerificationTokenByHash,
} from '../src/repos/verification-tokens-repo.ts';
import { createUser } from '../src/repos/users-repo.ts';
import { freshDb } from './helpers/db.ts';

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);

describe('verification-tokens-repo', () => {
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
      emailVerified: false,
    });
    userId = user.id;
  });
  afterEach(async () => {
    await dispose();
  });

  it('creates a token and finds it by hash', async () => {
    const created = await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-a',
      expiresAt: future,
    });
    expect(created.tokenHash).toBe('hash-a');
    expect(created.userId).toBe(userId);
    expect(created.createdAt).toBeInstanceOf(Date);

    const found = await findVerificationTokenByHash(db, 'hash-a');
    expect(found?.id).toBe(created.id);
    expect(await findVerificationTokenByHash(db, 'missing')).toBeUndefined();
  });

  it('consumes a token: returns it and deletes it', async () => {
    await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-consume',
      expiresAt: future,
    });
    const consumed = await consumeVerificationToken(db, 'hash-consume');
    expect(consumed?.tokenHash).toBe('hash-consume');
    // Second consume returns undefined.
    expect(await consumeVerificationToken(db, 'hash-consume')).toBeUndefined();
  });

  it('returns undefined when consuming a non-existent token', async () => {
    expect(await consumeVerificationToken(db, 'no-such-hash')).toBeUndefined();
  });

  it('deletes all tokens for a user', async () => {
    await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-del-1',
      expiresAt: future,
    });
    await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-del-2',
      expiresAt: future,
    });
    await deleteVerificationTokensForUser(db, userId);
    expect(await findVerificationTokenByHash(db, 'hash-del-1')).toBeUndefined();
    expect(await findVerificationTokenByHash(db, 'hash-del-2')).toBeUndefined();
  });

  it('deletes expired tokens and returns the count', async () => {
    await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-expired',
      expiresAt: past,
    });
    await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-live',
      expiresAt: future,
    });
    const count = await deleteExpiredVerificationTokens(db, new Date());
    expect(count).toBe(1);
    expect(await findVerificationTokenByHash(db, 'hash-expired')).toBeUndefined();
    expect(await findVerificationTokenByHash(db, 'hash-live')).toBeDefined();
  });

  it('counts active (unexpired) tokens for a user', async () => {
    await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-active',
      expiresAt: future,
    });
    await createVerificationToken(db, {
      id: newVerificationTokenId(),
      userId,
      tokenHash: 'hash-old',
      expiresAt: past,
    });
    const count = await countActiveTokensForUser(db, userId, new Date());
    expect(count).toBe(1);
  });
});
