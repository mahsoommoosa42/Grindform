/**
 * @file packages/web/e2e/helpers.ts
 *
 * Shared helpers for the Grindform E2E specs. Locators target the
 * `data-testid` attributes baked into the Lit components; Playwright
 * pierces the (open) shadow DOM automatically.
 */

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const DEFAULT_PASSWORD = 'correct-horse-battery';

/** A globally-unique email so parallel tests never collide on the shared server. */
export const freshEmail = (prefix = 'e2e'): string =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}@grindform.test`;

/** Create a brand-new account through the sign-up form and land in the app. */
export const signUp = async (
  page: Page,
  email: string = freshEmail(),
  password: string = DEFAULT_PASSWORD,
): Promise<string> => {
  await expect(page.getByTestId('auth')).toBeVisible();
  await page.getByTestId('auth-switch').click();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-consent').check();
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('generator')).toBeVisible();
  return email;
};

/** Sign in to an existing account through the login form. */
export const signIn = async (
  page: Page,
  email: string,
  password: string = DEFAULT_PASSWORD,
): Promise<void> => {
  await expect(page.getByTestId('auth')).toBeVisible();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('generator')).toBeVisible();
};

/**
 * Ensure we're signed in as `email`, registering it the first time and
 * logging in on later runs (so retries against the shared server work).
 */
export const ensureAccount = async (
  page: Page,
  email: string,
  password: string = DEFAULT_PASSWORD,
): Promise<void> => {
  await expect(page.getByTestId('auth')).toBeVisible();
  await page.getByTestId('auth-switch').click();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-consent').check();
  await page.getByTestId('auth-submit').click();
  const generator = page.getByTestId('generator');
  const authError = page.getByTestId('auth-error');
  await expect(generator.or(authError)).toBeVisible();
  if (await authError.isVisible()) {
    // Account already exists (a prior run/retry) — fall back to signing in.
    await page.getByTestId('auth-switch').click();
    await signIn(page, email, password);
  }
};

/** Load the app fresh, clearing any persisted theme, then sign up a new user. */
export const openApp = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await signUp(page);
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
