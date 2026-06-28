/**
 * @file packages/web/e2e/admin.spec.ts
 *
 * The admin console: an allowlisted admin can list accounts, open a
 * user's detail with its audit trail, and run the support actions
 * (disable / enable / delete). Each project signs in as its own
 * allowlisted admin email (see playwright.config webServer env), and
 * operates on a throwaway "victim" account created via an independent
 * API context so it never disturbs the admin's own session.
 */

import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { ensureAccount, freshEmail } from './helpers.ts';

const PASSWORD = 'correct-horse-battery';

const createVictim = async (request: APIRequestContext): Promise<{ id: string; email: string }> => {
  const email = freshEmail('victim');
  const res = await request.post('/v1/auth/register', {
    data: { email, password: PASSWORD, acceptTerms: true },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { user: { id: string } };
  return { id: body.user.id, email };
};

const signInAsAdmin = async (page: Page, projectName: string): Promise<void> => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ensureAccount(page, `admin-${projectName}@grindform.test`);
  await page.getByTestId('account-button').click();
  await page.getByTestId('open-admin').click();
  await expect(page.getByTestId('admin-users')).toBeVisible();
};

test('lists accounts and opens a user detail with its audit trail', async ({
  page,
  request,
}, testInfo) => {
  const victim = await createVictim(request);
  await signInAsAdmin(page, testInfo.project.name);
  await expect(page.getByTestId(`admin-row-${victim.id}`)).toContainText(victim.email);
  await page.getByTestId(`admin-view-${victim.id}`).click();
  await expect(page.getByTestId('admin-detail')).toContainText(victim.email);
  // Registration is recorded in the audit log.
  await expect(page.getByTestId('admin-audit')).toContainText('account.register');
});

test('disables and re-enables an account', async ({ page, request }, testInfo) => {
  const victim = await createVictim(request);
  await signInAsAdmin(page, testInfo.project.name);
  await page.getByTestId(`admin-view-${victim.id}`).click();

  await page.getByTestId('admin-toggle-status').click();
  await expect(page.getByTestId('admin-detail')).toContainText('Enable account');
  await expect(page.getByTestId(`admin-row-${victim.id}`)).toContainText('disabled');

  await page.getByTestId('admin-toggle-status').click();
  await expect(page.getByTestId('admin-detail')).toContainText('Disable account');
  await expect(page.getByTestId(`admin-row-${victim.id}`)).toContainText('active');
});

test('deletes an account', async ({ page, request }, testInfo) => {
  const victim = await createVictim(request);
  await signInAsAdmin(page, testInfo.project.name);
  await page.getByTestId(`admin-view-${victim.id}`).click();

  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('admin-delete').click();
  await expect(page.getByTestId(`admin-row-${victim.id}`)).toHaveCount(0);
});

test('a non-admin member cannot reach the console entry', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ensureAccount(page, freshEmail('member'));
  await page.getByTestId('account-button').click();
  await expect(page.getByTestId('open-admin')).toBeHidden();
});
