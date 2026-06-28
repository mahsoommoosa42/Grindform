import { describe, expect, it } from 'vitest';

import { collectSlots, summariseDay } from '../src/progress.ts';
import { makeDay, makeExternalDay, makeLog, makeSlot } from './helpers/fixtures.ts';

describe('collectSlots', () => {
  it('flattens slots across training sessions, skipping empty blocks', () => {
    const slots = [makeSlot(), makeSlot()];
    expect(collectSlots(makeDay(slots))).toHaveLength(2);
  });

  it('returns no slots for an external-only day', () => {
    expect(collectSlots(makeExternalDay())).toHaveLength(0);
  });
});

describe('summariseDay', () => {
  it('reports 0% for an external-only day with no exercise slots', () => {
    const progress = summariseDay(makeExternalDay(), []);
    expect(progress.totalSlots).toBe(0);
    expect(progress.percentComplete).toBe(0);
  });

  it('marks a slot complete once enough sets are logged and tracks top load', () => {
    const done = makeSlot();
    const partial = makeSlot();
    const day = makeDay([done, partial]);
    const logs = [
      makeLog({ slotId: done.id, loadKg: 60 }),
      makeLog({ slotId: done.id, loadKg: 65 }),
      makeLog({ slotId: done.id, loadKg: 62 }),
      makeLog({ slotId: partial.id, loadKg: 40 }),
    ];

    const progress = summariseDay(day, logs);
    expect(progress.totalSlots).toBe(2);
    expect(progress.completeSlots).toBe(1);
    expect(progress.percentComplete).toBe(50);

    const doneProgress = progress.slots.find((s) => s.slotId === done.id);
    expect(doneProgress?.complete).toBe(true);
    expect(doneProgress?.setsLogged).toBe(3);
    expect(doneProgress?.topSetLoadKg).toBe(65);

    const partialProgress = progress.slots.find((s) => s.slotId === partial.id);
    expect(partialProgress?.complete).toBe(false);
    expect(partialProgress?.topSetLoadKg).toBe(40);
  });

  it('omits topSetLoadKg for a slot with no logged sets', () => {
    const slot = makeSlot();
    const progress = summariseDay(makeDay([slot]), []);
    expect(progress.slots[0]?.setsLogged).toBe(0);
    expect(progress.slots[0]?.topSetLoadKg).toBeUndefined();
  });
});
