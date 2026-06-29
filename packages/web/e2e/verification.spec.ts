/**
 * @file packages/web/e2e/verification.spec.ts
 *
 * Email-verification flow: sign-up shows the "verify your email" banner,
 * the resend button works, and visiting the verify link marks the
 * account as verified (banner disappears).
 */

import { expect, test } from '@playwright/test';

import { freshEmail, signUp } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('shows a verification banner after sign-up with a resend button', async ({ page }) => {
  await signUp(page);
  const banner = page.getByTestId('verify-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('verify your email');
  await expect(page.getByTestId('resend-verification')).toBeVisible();
});

test('resend button triggers without error', async ({ page }) => {
  await signUp(page);
  const resend = page.getByTestId('resend-verification');
  await expect(resend).toBeVisible();
  await resend.click();
  // Button should still be visible (not crash) after clicking.
  await expect(resend).toBeVisible();
});

test('visiting a verify link marks the account as verified', async ({ page, request }) => {
  const email = freshEmail();
  await signUp(page, email);
  await expect(page.getByTestId('verify-banner')).toBeVisible();

  // Retrieve the verification URL from the test hook endpoint.
  const hookRes = await request.get(`/test/last-verify-url?email=${encodeURIComponent(email)}`);
  const { url } = (await hookRes.json()) as { url: string | null };
  expect(url).toBeTruthy();

  // Extract the raw token from the verification URL (may be relative).
  const verifyUrl = new URL(url!, 'http://localhost');
  const token = verifyUrl.searchParams.get('verify')!;
  expect(token).toBeTruthy();

  // Navigate to the verify URL.
  await page.goto(`/?verify=${encodeURIComponent(token)}`);

  // After verification: the app should load with a success banner and no
  // verification-needed banner.
  await expect(page.getByTestId('verify-success')).toBeVisible();
  await expect(page.getByTestId('verify-banner')).toBeHidden();
});

test('visiting an invalid verify token shows an error', async ({ page }) => {
  await page.goto('/?verify=totally-bogus-token');
  // Either land at auth or show an error (depends on session state).
  const errorBanner = page.getByTestId('verify-error');
  const authScreen = page.getByTestId('auth');
  await expect(errorBanner.or(authScreen)).toBeVisible();
});
