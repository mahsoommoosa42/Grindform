/**
 * @file packages/web/e2e/auth.spec.ts
 *
 * The authentication gate: sign-up (with GDPR consent), sign-in, the
 * account menu, sign-out, and the self-service data export. Every flow
 * runs across the full Chromium/WebKit × mobile/tablet/laptop matrix.
 */

import { expect, test } from '@playwright/test';

import { freshEmail, signIn, signUp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('shows the sign-in screen by default and can switch to sign-up', async ({ page }) => {
  await expect(page.getByTestId('auth')).toBeVisible();
  await expect(page.getByTestId('auth-submit')).toContainText('Sign in');
  await page.getByTestId('auth-switch').click();
  await expect(page.getByTestId('auth-submit')).toContainText('Create account');
  await expect(page.getByTestId('auth-consent')).toBeVisible();
});

test('requires GDPR consent before creating an account', async ({ page }) => {
  await page.getByTestId('auth-switch').click();
  await page.getByTestId('auth-email').fill(freshEmail());
  await page.getByTestId('auth-password').fill('correct-horse-battery');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('privacy');
  await expect(page.getByTestId('generator')).toBeHidden();
});

test('signs up, lands in the app, and surfaces the account email', async ({ page }) => {
  const email = await signUp(page);
  await expect(page.getByTestId('generator')).toBeVisible();
  await page.getByTestId('account-button').click();
  await expect(page.getByTestId('account-email')).toHaveText(email);
  // A plain member must not see the admin console entry.
  await expect(page.getByTestId('open-admin')).toBeHidden();
});

test('rejects a wrong password on sign-in', async ({ page }) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.getByTestId('account-button').click();
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('auth')).toBeVisible();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('the-wrong-password');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('auth-error')).toBeVisible();
});

test('logs out and back in, preserving the account', async ({ page }) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.getByTestId('account-button').click();
  await page.getByTestId('logout').click();
  await signIn(page, email);
  await expect(page.getByTestId('generator')).toBeVisible();
});

test('a returning session survives a reload', async ({ page }) => {
  await signUp(page);
  await page.reload();
  // No re-auth: the session cookie keeps us in the app.
  await expect(page.getByTestId('generator')).toBeVisible();
  await expect(page.getByTestId('auth')).toBeHidden();
});

test('exports the account data as a JSON download', async ({ page }) => {
  await signUp(page);
  await page.getByTestId('account-button').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-data').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('grindform-export.json');
});

test('opens the privacy notice from the account menu', async ({ page }) => {
  await signUp(page);
  await page.getByTestId('account-button').click();
  await page.getByTestId('open-privacy-menu').click();
  await expect(page.getByTestId('privacy')).toBeVisible();
  await page.getByTestId('privacy-close').click();
  await expect(page.getByTestId('privacy')).toBeHidden();
});
