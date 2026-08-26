import { expect, test } from '@playwright/test';

import { generatePlan, openApp, tapOrClick } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('uses a bench PR to estimate the profile and prescribe tracker loads', async ({ page }) => {
  await expect(page.getByTestId('personal-records')).toBeVisible();
  await page.getByTestId('pr-weight-bench_press').fill('80');
  await page.getByTestId('pr-reps-bench_press').fill('1');
  await tapOrClick(page, 'pr-save-bench_press');

  await expect(page.getByTestId('pr-source-bench_press')).toHaveText('Measured');
  for (const lift of ['back_squat', 'deadlift', 'overhead_press', 'barbell_row']) {
    await expect(page.getByTestId(`pr-source-${lift}`)).toHaveText('Estimated');
    await expect(page.getByTestId(`pr-orm-${lift}`)).toContainText('1RM:');
  }

  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await generatePlan(page);
  await tapOrClick(page, 'track-mon');
  await expect(page.getByTestId('tracker')).toBeVisible();
  const prSlot = page
    .locator('.slot')
    .filter({ has: page.getByTestId('pr-prescription').first() })
    .first();
  await expect(prSlot.getByTestId('pr-prescription')).toContainText('from your PRs');
  await expect(prSlot.locator('input[data-testid^="set-weight-"]').first()).not.toHaveValue('');
});

test('rejects PRs outside the supported weight and rep bounds', async ({ page }) => {
  const weight = page.getByTestId('pr-weight-bench_press');
  const reps = page.getByTestId('pr-reps-bench_press');
  await weight.fill('501');
  await reps.fill('21');
  await tapOrClick(page, 'pr-save-bench_press');
  await expect(page.getByTestId('personal-records-error')).toHaveText(
    'Enter a weight up to 500 kg and 1–20 reps.',
  );
  await expect(page.getByTestId('personal-records-empty')).toBeVisible();
});

test('refreshes untouched tracker slots after saving a PR', async ({ page }) => {
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await generatePlan(page);
  await tapOrClick(page, 'track-mon');
  await expect(page.getByTestId('tracker')).toBeVisible();
  await tapOrClick(page, 'tracker-close');
  await tapOrClick(page, 'nav-generate');

  await page.getByTestId('pr-weight-bench_press').fill('80');
  await page.getByTestId('pr-reps-bench_press').fill('1');
  await tapOrClick(page, 'pr-save-bench_press');
  await tapOrClick(page, 'nav-week');
  await tapOrClick(page, 'track-mon');

  const prSlot = page
    .locator('.slot')
    .filter({ has: page.getByTestId('pr-prescription').first() })
    .first();
  await expect(prSlot.getByTestId('pr-prescription')).toContainText('from your PRs');
  await expect(prSlot.locator('input[data-testid^="set-weight-"]').first()).not.toHaveValue('');
});
