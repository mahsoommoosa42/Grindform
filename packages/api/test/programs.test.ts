import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';

import type { AppEnv } from '../src/context.ts';
import { assignWeek } from '@grindform/db';
import type { UserId } from '@grindform/core';
import { freshApp, registerClient } from './helpers/db.ts';
import type { Client } from './helpers/db.ts';

const input = {
  startWeek: '2026-07-20',
  weeks: 3,
  goal: 'lose_fat',
  days: [
    { weekday: 'mon', sessions: [{ kind: 'training', focus: ['glutes'] }] },
    { weekday: 'tue', sessions: [] },
    { weekday: 'wed', sessions: [] },
    { weekday: 'thu', sessions: [] },
    { weekday: 'fri', sessions: [] },
    { weekday: 'sat', sessions: [] },
    { weekday: 'sun', sessions: [] },
  ],
};

describe('program API', () => {
  let app: Hono<AppEnv>;
  let client: Client;
  let db: Awaited<ReturnType<typeof freshApp>>['db'];
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ app, db, dispose } = await freshApp({ now: () => new Date('2026-07-13T12:00:00Z') }));
    client = await registerClient(app, 'program@example.com');
  });
  afterEach(async () => {
    await dispose();
  });

  it('generates, lists, fetches, and resolves a program week', async () => {
    const created = await client.json('/v1/programs', 'POST', input);
    expect(created.status).toBe(201);
    const program = (await created.json()) as { program: { id: string; weeks: unknown[] } };
    expect(program.program.id).toMatch(/^prg_/);
    expect(program.program.weeks).toHaveLength(3);

    const listed = await client.request('/v1/programs');
    expect(listed.status).toBe(200);
    expect((await listed.json()).programs).toHaveLength(1);

    const fetched = await client.request(`/v1/programs/${program.program.id}`);
    expect(fetched.status).toBe(200);
    expect((await fetched.json()).program.id).toBe(program.program.id);

    const resolved = await client.request('/v1/weeks/2026-07-20');
    expect(resolved.status).toBe(200);
    expect((await resolved.json()).source).toBe('assigned');
  });

  it('marks and unmarks a future break and resolves it distinctly', async () => {
    const created = await client.json('/v1/programs', 'POST', input);
    const program = (await created.json()) as { program: { id: string } };
    const marked = await client.json(
      `/v1/programs/${program.program.id}/weeks/2026-07-27/break`,
      'POST',
      {},
    );
    expect(marked.status).toBe(200);
    const resolved = await client.request('/v1/weeks/2026-07-27');
    expect(await resolved.json()).toMatchObject({ source: 'break', kind: 'break', plan: null });

    const unmarked = await client.json(
      `/v1/programs/${program.program.id}/weeks/2026-07-27/break`,
      'DELETE',
      {},
    );
    expect(unmarked.status).toBe(200);
    expect((await (await client.request('/v1/weeks/2026-07-27')).json()).source).toBe('assigned');
  });

  it('preserves the default plan across break replanning', async () => {
    const created = await client.json('/v1/programs', 'POST', input);
    const program = (await created.json()) as {
      program: { id: string; weeks: Array<{ plan?: { id: string } }> };
    };
    const defaultPlanId = program.program.weeks[0]?.plan?.id;
    expect(defaultPlanId).toBeTruthy();
    const setDefault = await client.request(`/v1/plans/${defaultPlanId}/default`, {
      method: 'PUT',
    });
    expect(setDefault.status).toBe(200);

    for (const method of ['POST', 'DELETE'] as const) {
      const changed = await client.json(
        `/v1/programs/${program.program.id}/weeks/2026-07-27/break`,
        method,
        {},
      );
      expect(changed.status).toBe(200);
      const plans = (await (await client.request('/v1/plans')).json()).plans as Array<{
        id: string;
        isDefault: boolean;
        programId?: string;
      }>;
      expect(plans.filter((plan) => plan.isDefault)).toHaveLength(1);
      expect(plans.find((plan) => plan.isDefault)?.programId).toBe(program.program.id);
      const resolved = await client.request('/v1/weeks/2026-08-17');
      expect(await resolved.json()).toMatchObject({
        source: 'default',
        plan: { id: expect.any(String) },
      });
    }
  });

  it('rejects past and outside-program break requests', async () => {
    const created = await client.json('/v1/programs', 'POST', input);
    const program = (await created.json()) as { program: { id: string } };
    expect(
      (await client.json(`/v1/programs/${program.program.id}/weeks/2026-07-06/break`, 'POST', {}))
        .status,
    ).toBe(400);
    expect(
      (await client.json(`/v1/programs/${program.program.id}/weeks/2026-07-06/break`, 'DELETE', {}))
        .status,
    ).toBe(400);
    expect(
      (await client.json(`/v1/programs/${program.program.id}/weeks/2026-08-17/break`, 'POST', {}))
        .status,
    ).toBe(404);
    const unknown = `prg_${'0'.repeat(26)}`;
    expect((await client.request(`/v1/programs/${unknown}`)).status).toBe(404);
    expect(
      (await client.json(`/v1/programs/${unknown}/weeks/2026-07-27/break`, 'POST', {})).status,
    ).toBe(404);
    expect(
      (await client.json(`/v1/programs/${unknown}/weeks/2026-07-27/break`, 'DELETE', {})).status,
    ).toBe(404);
    expect((await client.request(`/v1/programs/${unknown}`, { method: 'DELETE' })).status).toBe(
      404,
    );
    expect(
      (await client.json('/v1/programs', 'POST', { ...input, startWeek: '2026-07-06' })).status,
    ).toBe(400);
  });

  it('preserves multiple marked breaks when replanning repeatedly', async () => {
    const created = await client.json('/v1/programs', 'POST', input);
    const program = (await created.json()) as { program: { id: string } };
    const first = await client.json(
      `/v1/programs/${program.program.id}/weeks/2026-07-27/break`,
      'POST',
      {},
    );
    expect(first.status).toBe(200);
    const second = await client.json(
      `/v1/programs/${program.program.id}/weeks/2026-08-03/break`,
      'POST',
      {},
    );
    expect(second.status).toBe(200);
    const current = (await second.json()) as {
      program: {
        weeks: Array<{ weekStart: string; kind: string; loadIndex: number }>;
      };
    };
    expect(
      current.program.weeks.filter((week) => week.kind === 'break').map((week) => week.weekStart),
    ).toEqual(['2026-07-27', '2026-08-03']);
    expect(
      current.program.weeks.find((week) => week.weekStart === '2026-08-10')?.loadIndex,
    ).toBeLessThan(1.1);
  });

  it('deletes an owned program and its materialized weeks', async () => {
    const created = await client.json('/v1/programs', 'POST', input);
    const program = (await created.json()) as { program: { id: string } };
    const deleted = await client.request(`/v1/programs/${program.program.id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);
    expect((await client.request(`/v1/programs/${program.program.id}`)).status).toBe(404);
    expect((await client.request('/v1/weeks/2026-07-20')).status).toBe(200);
    expect((await (await client.request('/v1/weeks/2026-07-20')).json()).source).toBe(null);
    expect((await client.request(`/v1/programs/${program.program.id}`)).status).toBe(404);
  });

  it('resolves a nullable non-break assignment without falling back to default', async () => {
    await assignWeek(db, client.userId as UserId, '2026-08-03', null, { kind: 'train' });
    const resolved = await client.request('/v1/weeks/2026-08-03');
    expect(await resolved.json()).toMatchObject({ source: null, plan: null });
  });
});
