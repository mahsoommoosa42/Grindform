import { expect, test } from '@playwright/test';

import { generatePlan, openApp, tapOrClick } from './helpers.ts';

test('generated plans are tagged, survive reload, and carry forward as default', async ({
  page,
}) => {
  await openApp(page);
  await generatePlan(page);
  await expect(page.getByTestId('week-source')).toContainText('Tagged to this week');

  await page.reload();
  await expect(page.getByTestId('week')).toBeVisible();
  await expect(page.getByTestId('week-source')).toContainText('Tagged to this week');

  await tapOrClick(page, 'nav-calendar');
  await expect(page.getByTestId('calendar')).toBeVisible();
  await expect(page.locator('[data-testid^="calendar-week-"]').first()).toBeVisible();

  const plan = page.locator('[data-testid^="calendar-plan-"]').first();
  await expect(plan).toContainText('Clear default');
  await tapOrClick(page, 'nav-week');
  await tapOrClick(page, 'next-week');
  await expect(page.getByTestId('week-source')).toContainText('Default plan');
});
