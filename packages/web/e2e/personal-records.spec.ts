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
  await expect(page.getByTestId('pr-prescription').first()).toContainText('from your PRs');
  await expect(page.locator('input[data-testid^="set-weight-"]').first()).not.toHaveValue('');
});
