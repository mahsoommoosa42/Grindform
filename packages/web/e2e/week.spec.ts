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

test('external-activity days show the activity; empty days are rest days', async ({ page }) => {
  // Wednesday defaults to an external Pilates session.
  await expect(page.getByTestId('card-wed')).toContainText('Pilates');
  // Sunday defaults to no sessions — a rest day with no tracker button.
  await expect(page.getByTestId('rest-card-sun')).toContainText('Rest day');
  await expect(page.getByTestId('track-sun')).toHaveCount(0);
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

test('an external activity session can be marked done from its tracker', async ({ page }) => {
  // Wednesday is an external Pilates session; open its tracker and complete it.
  await tapOrClick(page, 'track-wed');
  await expect(page.getByTestId('tracker')).toBeVisible();
  const done = page.locator('[data-testid^="ext-done-"]').first();
  await expect(done).toContainText('Mark done');
  await done.click();
  await expect(done).toContainText('Done');
});
