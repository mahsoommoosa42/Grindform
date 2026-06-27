/**
 * @file packages/web/e2e/helpers.ts
 *
 * Shared helpers for the Grindform E2E specs. Locators target the
 * `data-testid` attributes baked into the Lit components; Playwright
 * pierces the (open) shadow DOM automatically.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Load the app fresh, clearing any persisted theme first. */
export const openApp = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('generator')).toBeVisible();
};

/** Does the active browser context expose touch input? */
export const hasTouch = (page: Page): Promise<boolean> =>
  page.evaluate(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0);

/** Tap if the context supports touch, otherwise click — same intent. */
export const tapOrClick = async (page: Page, testId: string): Promise<void> => {
  const target = page.getByTestId(testId);
  if (await hasTouch(page)) {
    await target.tap();
  } else {
    await target.click();
  }
};

/** Generate a plan from whatever the form currently holds. */
export const generatePlan = async (page: Page): Promise<void> => {
  await tapOrClick(page, 'generate');
  await expect(page.getByTestId('week')).toBeVisible();
};
