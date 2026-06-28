import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newUserId } from '@grindform/core';

import type { Db } from '../src/client.ts';
import { listAuditForUser, recordAudit } from '../src/repos/audit-repo.ts';
import { freshDb } from './helpers/db.ts';

describe('audit-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('records entries (defaulting details) and lists them for a target, newest first', async () => {
    const actor = newUserId();
    const target = newUserId();
    const other = newUserId();

    const first = await recordAudit(db, {
      action: 'account.register',
      actorUserId: target,
      targetUserId: target,
    });
    expect(first.details).toEqual({});
    await new Promise((r) => setTimeout(r, 2));
    await recordAudit(db, {
      action: 'admin.user.disable',
      actorUserId: actor,
      targetUserId: target,
      details: { reason: 'support request' },
    });
    await recordAudit(db, {
      action: 'account.login',
      actorUserId: other,
      targetUserId: other,
    });

    const rows = await listAuditForUser(db, target);
    expect(rows.map((r) => r.action)).toEqual(['admin.user.disable', 'account.register']);
    expect(rows[0]?.details).toEqual({ reason: 'support request' });
  });
});
