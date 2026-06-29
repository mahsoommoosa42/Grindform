/**
 * @file packages/web/e2e/undo-redo.spec.ts
 *
 * Multi-step undo/redo of plan edits. The top-bar ↶/↷ buttons appear only
 * when an action is available (hidden — but keeping their footprint — when
 * not), and stepping through them walks the plan back and forward across the
 * swap/add/remove edits, persisted via the server.
 */

import { expect, test } from '@playwright/test';

import { generatePlan, openApp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await generatePlan(page);
});

test('undo/redo buttons toggle with availability and keep their slot', async ({ page }) => {
  // The control bar is always mounted, so the header never reflows.
  await expect(page.getByTestId('history-controls')).toBeVisible();
  // With no edits yet, neither button is actionable (hidden via visibility).
  await expect(page.getByTestId('undo')).not.toBeVisible();
  await expect(page.getByTestId('redo')).not.toBeVisible();

  const slots = page.locator('[data-testid^="week-slot-"]');
  const before = await slots.count();

  // An edit (remove) makes Undo available and Redo still unavailable.
  await page.locator('[data-testid^="remove-"]').first().click();
  await expect(slots).toHaveCount(before - 1);
  await expect(page.getByTestId('undo')).toBeVisible();
  await expect(page.getByTestId('redo')).not.toBeVisible();

  // Undo restores the removed slot; now Redo is available and Undo is not.
  await page.getByTestId('undo').click();
  await expect(slots).toHaveCount(before);
  await expect(page.getByTestId('redo')).toBeVisible();
  await expect(page.getByTestId('undo')).not.toBeVisible();

  // Redo re-applies the removal.
  await page.getByTestId('redo').click();
  await expect(slots).toHaveCount(before - 1);
  await expect(page.getByTestId('undo')).toBeVisible();
  await expect(page.getByTestId('redo')).not.toBeVisible();
});

test('a fresh edit after undo clears the redo stack', async ({ page }) => {
  const slots = page.locator('[data-testid^="week-slot-"]');
  const before = await slots.count();

  await page.locator('[data-testid^="remove-"]').first().click();
  await expect(slots).toHaveCount(before - 1);
  await page.getByTestId('undo').click();
  await expect(slots).toHaveCount(before);
  await expect(page.getByTestId('redo')).toBeVisible();

  // A new edit forks history: the previously-undone redo is discarded.
  await page.locator('[data-testid^="remove-"]').first().click();
  await expect(slots).toHaveCount(before - 1);
  await expect(page.getByTestId('redo')).not.toBeVisible();
  await expect(page.getByTestId('undo')).toBeVisible();
});
