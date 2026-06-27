/**
 * @file packages/web/e2e/tracker.spec.ts
 *
 * The in-session tracker: opening a day, logging load + reps, marking a
 * slot complete, watching progress advance, and dismissing the sheet.
 */

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { generatePlan, openApp, tapOrClick } from './helpers.ts';

const firstSlot = (page: Page): Locator => page.locator('[data-testid^="slot-"]').first();

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await generatePlan(page);
  await tapOrClick(page, 'track-mon');
  await expect(page.getByTestId('tracker')).toBeVisible();
});

test('opens the tracker at 0% with exercise slots', async ({ page }) => {
  await expect(page.getByTestId('tracker-pct')).toContainText('0%');
  await expect(firstSlot(page)).toBeVisible();
});

test('logs a set and advances progress', async ({ page }) => {
  const slot = firstSlot(page);
  const slotId = await slot.getAttribute('data-testid');
  expect(slotId).not.toBeNull();
  const id = (slotId as string).replace('slot-', '');

  await page.getByTestId(`load-${id}`).fill('60');
  await page.getByTestId(`reps-${id}`).fill('8');
  await tapOrClick(page, `complete-${id}`);

  await expect(page.getByTestId(`complete-${id}`)).toContainText('Done');
  await expect(page.getByTestId(`slot-${id}`)).toHaveClass(/done/);
  await expect(page.getByTestId('tracker-pct')).not.toHaveText('0% complete');
});

test('can be marked done with no load entered (bodyweight)', async ({ page }) => {
  const slot = firstSlot(page);
  const id = ((await slot.getAttribute('data-testid')) as string).replace('slot-', '');
  await tapOrClick(page, `complete-${id}`);
  await expect(page.getByTestId(`slot-${id}`)).toHaveClass(/done/);
});

test('closes via the X button', async ({ page }) => {
  await tapOrClick(page, 'tracker-close');
  await expect(page.getByTestId('tracker')).toBeHidden();
});

test('closes when tapping the backdrop', async ({ page }) => {
  await page.getByTestId('tracker').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('tracker')).toBeHidden();
});
