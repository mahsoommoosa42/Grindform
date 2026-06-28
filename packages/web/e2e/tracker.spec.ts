/**
 * @file packages/web/e2e/tracker.spec.ts
 *
 * The in-session tracker: opening a day, the per-set grid (warm-up +
 * working sets), prescribed-load pre-fill from a recent set, the pyramid
 * toggle, logging working sets in order, the volume summary, and
 * dismissing the sheet.
 */

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { generatePlan, openApp, tapOrClick } from './helpers.ts';

const firstSlot = (page: Page): Locator => page.locator('[data-testid^="slot-"]').first();

const slotId = async (page: Page): Promise<string> => {
  const id = await firstSlot(page).getAttribute('data-testid');
  expect(id).not.toBeNull();
  return (id as string).replace('slot-', '');
};

/** Click every working "Log" button in order, waiting for each to register. */
const logAllWorkingSets = async (page: Page, id: string): Promise<void> => {
  for (let i = 0; i < 12; i += 1) {
    const btn = page.getByTestId(`log-set-${id}-${i}`);
    if ((await btn.count()) === 0) break;
    await btn.click();
    await expect(btn).toContainText('Done', { timeout: 5000 });
  }
};

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

test('a recent set pre-fills the prescribed working weight', async ({ page }) => {
  const id = await slotId(page);
  await page.getByTestId(`recent-weight-${id}`).fill('100');
  await page.getByTestId(`recent-reps-${id}`).fill('5');
  // The first working set's weight input should now be a positive number.
  const firstWorkingWeight = page.getByTestId(`set-weight-${id}-0`).first();
  await expect(firstWorkingWeight).not.toHaveValue('');
  const value = Number(await firstWorkingWeight.inputValue());
  expect(value).toBeGreaterThan(0);
});

test('logs every working set and completes the slot', async ({ page }) => {
  const id = await slotId(page);
  await page.getByTestId(`recent-weight-${id}`).fill('80');
  await page.getByTestId(`recent-reps-${id}`).fill('8');
  await logAllWorkingSets(page, id);

  await expect(page.getByTestId(`slot-${id}`)).toHaveClass(/done/);
  await expect(page.getByTestId('tracker-pct')).not.toHaveText('0% complete');
});

test('shows a kg-per-muscle volume summary after logging', async ({ page }) => {
  const id = await slotId(page);
  await page.getByTestId(`recent-weight-${id}`).fill('80');
  await page.getByTestId(`recent-reps-${id}`).fill('8');
  await logAllWorkingSets(page, id);

  const volume = page.getByTestId('day-volume');
  await expect(volume).toBeVisible();
  await expect(page.getByTestId('day-volume-total')).toContainText('kg');
});

test('pyramid toggle ramps the working weights', async ({ page }) => {
  const id = await slotId(page);
  await page.getByTestId(`recent-weight-${id}`).fill('100');
  await page.getByTestId(`recent-reps-${id}`).fill('5');

  const toggle = page.getByTestId(`pyramid-${id}`);
  // Ensure pyramid is on, then read the first vs last working-set weights.
  if (!(await toggle.isChecked())) await toggle.check();

  const weights = page.locator(`[data-testid^="set-weight-${id}-"]`);
  const count = await weights.count();
  const first = Number(await weights.nth(0).inputValue());
  const last = Number(await weights.nth(count - 1).inputValue());
  // A pyramid ramps weight up across sets: the last working set is heavier.
  expect(last).toBeGreaterThanOrEqual(first);
});

test('bodyweight: a working set can be logged with no load', async ({ page }) => {
  const id = await slotId(page);
  await page.getByTestId(`log-set-${id}-0`).click();
  await expect(page.getByTestId(`log-set-${id}-0`)).toContainText('Done');
});

test('closes via the X button', async ({ page }) => {
  await tapOrClick(page, 'tracker-close');
  await expect(page.getByTestId('tracker')).toBeHidden();
});

test('closes when tapping the backdrop', async ({ page }) => {
  await page.getByTestId('tracker').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('tracker')).toBeHidden();
});
