/**
 * @file packages/web/e2e/responsive.spec.ts
 *
 * Screen-config coverage. Because every project in the matrix runs at a
 * different viewport (mobile / tablet / laptop) on both engines, these
 * assertions verify the layout stays usable and the core flow works at
 * whatever size the current project sets — and that tap targets meet the
 * 44px accessibility minimum on touch devices.
 */

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { generatePlan, hasTouch, openApp, tapOrClick } from './helpers.ts';

/** Assert an element's right edge stays within the viewport (no horizontal overflow). */
const expectWithinViewport = async (page: Page, target: Locator): Promise<void> => {
  const viewport = page.viewportSize();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  if (box !== null && viewport !== null) {
    // Allow a sub-pixel rounding tolerance.
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
};

test('core flow works at the current viewport', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('generator')).toBeVisible();
  await generatePlan(page);
  await expect(page.getByTestId('card-mon')).toBeVisible();
});

test('primary call-to-action fits the viewport width', async ({ page }) => {
  await openApp(page);
  const viewport = page.viewportSize();
  const box = await page.getByTestId('generate').boundingBox();
  expect(box).not.toBeNull();
  if (box !== null && viewport !== null) {
    expect(box.width).toBeLessThanOrEqual(viewport.width);
  }
});

test('the account control stays within the viewport width', async ({ page }) => {
  await openApp(page);
  await expectWithinViewport(page, page.getByTestId('account-button'));
});

test('tracker action buttons stay within the viewport width', async ({ page }) => {
  await openApp(page);
  await generatePlan(page);
  await tapOrClick(page, 'track-mon');
  await expect(page.getByTestId('tracker')).toBeVisible();
  const slot = page.locator('[data-testid^="slot-"]').first();
  const id = ((await slot.getAttribute('data-testid')) as string).replace('slot-', '');
  await expectWithinViewport(page, page.getByTestId(`complete-${id}`));
});

test('tap targets are at least 44px tall on touch devices', async ({ page }) => {
  await openApp(page);
  if (!(await hasTouch(page))) {
    test.skip();
    return;
  }
  const box = await page.getByTestId('generate').boundingBox();
  expect(box).not.toBeNull();
  if (box !== null) {
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
