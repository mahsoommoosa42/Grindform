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

  const { currentWeek, nextWeek } = await page.evaluate(() => {
    const monday = (date: Date): string => {
      const day = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      return date.toISOString().slice(0, 10);
    };
    const current = monday(new Date());
    const next = new Date(`${current}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    return { currentWeek: current, nextWeek: next.toISOString().slice(0, 10) };
  });
  const currentTrigger = page.getByTestId(`calendar-dropdown-trigger-${currentWeek}`);
  await expect(currentTrigger).toContainText('Build muscle');
  await currentTrigger.press('Enter');
  const currentMenu = page.getByTestId(`calendar-dropdown-menu-${currentWeek}`);
  await expect(currentMenu).toBeVisible();
  const currentMenuBox = await currentMenu.boundingBox();
  const viewport = page.viewportSize();
  expect(currentMenuBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((currentMenuBox?.x ?? 0) + (currentMenuBox?.width ?? 0)).toBeLessThanOrEqual(
    (viewport?.width ?? 0) + 1,
  );
  await currentTrigger.press('Escape');
  await expect(currentMenu).toHaveCount(0);

  const plan = page.locator('[data-testid^="calendar-plan-"]').first();
  await expect(plan).toContainText('Clear default');
  const planTestId = await plan.getAttribute('data-testid');
  expect(planTestId).toMatch(/^calendar-plan-/);
  const planId = planTestId?.slice('calendar-plan-'.length);
  expect(planId).toBeTruthy();

  const nextRow = page.getByTestId(`calendar-week-${nextWeek}`);
  const nextTrigger = page.getByTestId(`calendar-dropdown-trigger-${nextWeek}`);
  await nextTrigger.click();
  await expect(page.getByTestId(`calendar-dropdown-menu-${nextWeek}`)).toBeVisible();
  await page.getByTestId(`calendar-dropdown-item-${nextWeek}-${planId}`).click();
  await expect(nextRow).toContainText('tagged');

  await nextTrigger.click();
  await page.getByTestId(`calendar-dropdown-item-${nextWeek}-untag`).click();
  await expect(nextRow).toContainText('default');

  await tapOrClick(page, 'nav-week');
  await tapOrClick(page, 'next-week');
  await expect(page.getByTestId('week-source')).toContainText('Default plan');
});

test('generates a program, replans a break week, and restores it when unmarked', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('program-weeks').fill('3');
  await expect(page.getByTestId('generate')).toContainText('Generate 3-week program');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('calendar')).toBeVisible();
  const programCard = page.locator('[data-testid^="calendar-program-"]').first();
  await expect(programCard).toBeVisible();
  const programTestId = await programCard.getAttribute('data-testid');
  expect(programTestId).toMatch(/^calendar-program-/);
  const programId = programTestId?.slice('calendar-program-'.length);
  expect(programId).toBeTruthy();

  const { currentWeek, nextWeek, followingWeek, afterProgramWeek } = await page.evaluate(() => {
    const monday = (date: Date): string => {
      const day = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      return date.toISOString().slice(0, 10);
    };
    const current = monday(new Date());
    return {
      currentWeek: current,
      nextWeek: new Date(new Date(`${current}T00:00:00Z`).getTime() + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      followingWeek: new Date(new Date(`${current}T00:00:00Z`).getTime() + 14 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      afterProgramWeek: new Date(new Date(`${current}T00:00:00Z`).getTime() + 28 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    };
  });
  const next = page.getByTestId(`calendar-week-${nextWeek}`);
  await expect(page.getByTestId(`calendar-load-${currentWeek}`)).toContainText('100%');
  await expect(page.getByTestId(`calendar-load-${nextWeek}`)).toContainText('105%');
  const baselineFollowing = await page.getByTestId(`calendar-load-${followingWeek}`).textContent();
  const defaultPlan = page.locator('.calendar-plan').first();
  await defaultPlan.getByRole('button', { name: 'Set as default' }).click();
  await expect(defaultPlan).toContainText('Clear default');

  await page.getByTestId(`calendar-break-${nextWeek}`).click();
  await expect(next).toContainText('Break');
  await expect(next).toContainText('no plan');
  await expect(page.getByTestId(`calendar-load-${nextWeek}`)).toContainText('0%');
  await expect(page.getByTestId(`calendar-load-${followingWeek}`)).toContainText(
    'reduced after break',
  );
  for (const load of await page.locator('[data-testid^="calendar-load-"]').allTextContents()) {
    if (load.includes('· train')) expect(load).not.toMatch(/^0%/);
  }
  const adjustedFollowing = await page.getByTestId(`calendar-load-${followingWeek}`).textContent();
  expect(adjustedFollowing).not.toBe(baselineFollowing);
  await expect(page.locator('.calendar-plan').filter({ hasText: 'Clear default' })).toHaveCount(1);
  await expect(page.getByTestId(`calendar-week-${afterProgramWeek}`)).toContainText('default');

  await page.getByTestId(`calendar-break-${nextWeek}`).click();
  await expect(page.getByTestId(`calendar-load-${nextWeek}`)).toContainText('105%');
  await expect(page.getByTestId(`calendar-load-${followingWeek}`)).not.toContainText(
    'reduced after break',
  );
  await expect(page.locator('.calendar-plan').filter({ hasText: 'Clear default' })).toHaveCount(1);
  await expect(page.getByTestId(`calendar-week-${afterProgramWeek}`)).toContainText('default');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId(`calendar-delete-program-${programId}`).click();
  await expect(programCard).toHaveCount(0);
  await expect(page.getByTestId(`calendar-load-${currentWeek}`)).toHaveCount(0);
});
