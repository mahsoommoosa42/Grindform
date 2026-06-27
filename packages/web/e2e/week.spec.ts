/**
 * @file packages/web/e2e/week.spec.ts
 *
 * The generated weekly view: training day cards carry time blocks, blocked
 * days surface their activity, navigation between Build and My week works,
 * and the boredom-swap rebuild produces a fresh week.
 */

import { expect, test } from '@playwright/test';

import { generatePlan, openApp, tapOrClick } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await generatePlan(page);
});

test('renders a card per weekday with the goal header', async ({ page }) => {
  await expect(page.getByTestId('week')).toContainText('Build muscle');
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    await expect(page.getByTestId(`card-${day}`)).toBeVisible();
  }
});

test('training days list their time blocks', async ({ page }) => {
  const monday = page.getByTestId('card-mon');
  await expect(monday).toContainText('Warm-up');
  await expect(monday).toContainText('Main lift');
  await expect(monday).toContainText('Cool-down');
  await expect(page.getByTestId('track-mon')).toBeVisible();
});

test('blocked days show their activity and no tracker button', async ({ page }) => {
  await expect(page.getByTestId('activity-wed')).toContainText('Pilates');
  await expect(page.getByTestId('track-wed')).toHaveCount(0);
  await expect(page.getByTestId('activity-sun')).toContainText('Rest');
});

test('can navigate back to Build and into My week', async ({ page }) => {
  await tapOrClick(page, 'nav-generate');
  await expect(page.getByTestId('generator')).toBeVisible();
  await expect(page.getByTestId('nav-week')).toBeEnabled();
  await tapOrClick(page, 'nav-week');
  await expect(page.getByTestId('week')).toBeVisible();
});

test('boredom swap rebuilds the week', async ({ page }) => {
  await tapOrClick(page, 'rebuild');
  await expect(page.getByTestId('week')).toBeVisible();
  await expect(page.getByTestId('card-mon')).toBeVisible();
});
