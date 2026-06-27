/**
 * @file packages/web/e2e/generator.spec.ts
 *
 * The plan-builder screen: form defaults, equipment + focus toggles,
 * blocking days for preplanned activities, validation, and the time
 * budget controls (including the first-15-minutes physio block).
 */

import { expect, test } from '@playwright/test';

import { generatePlan, openApp, tapOrClick } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('shows the builder with sensible defaults', async ({ page }) => {
  await expect(page.getByTestId('brand')).toContainText('Grindform');
  await expect(page.getByTestId('goal')).toHaveValue('build_muscle');
  await expect(page.getByTestId('experience')).toHaveValue('intermediate');
  await expect(page.getByTestId('variation')).toHaveValue('A');
  // My week is unreachable until a plan exists.
  await expect(page.getByTestId('nav-week')).toBeDisabled();
});

test('equipment chips toggle and reflect pressed state', async ({ page }) => {
  const barbell = page.getByTestId('equipment-barbell');
  await expect(barbell).toHaveAttribute('aria-pressed', 'true');
  await tapOrClick(page, 'equipment-barbell');
  await expect(barbell).toHaveAttribute('aria-pressed', 'false');
  await tapOrClick(page, 'equipment-barbell');
  await expect(barbell).toHaveAttribute('aria-pressed', 'true');
});

test('blocks generation when no equipment is selected', async ({ page }) => {
  for (const item of [
    'barbell',
    'dumbbell',
    'cable',
    'machine',
    'kettlebell',
    'band',
    'bodyweight',
  ]) {
    const chip = page.getByTestId(`equipment-${item}`);
    if ((await chip.getAttribute('aria-pressed')) === 'true') {
      await tapOrClick(page, `equipment-${item}`);
    }
  }
  await tapOrClick(page, 'generate');
  await expect(page.getByTestId('error')).toContainText('equipment');
  await expect(page.getByTestId('week')).toBeHidden();
});

test('focus chips toggle for a training day', async ({ page }) => {
  const quads = page.getByTestId('focus-mon-quads');
  await expect(quads).toHaveAttribute('aria-pressed', 'false');
  await tapOrClick(page, 'focus-mon-quads');
  await expect(quads).toHaveAttribute('aria-pressed', 'true');
});

test('blocking a day hides its focus chips and is honoured in the plan', async ({ page }) => {
  await page.getByTestId('day-mode-mon').selectOption('physio');
  await expect(page.getByTestId('dayrow-mon')).toContainText('Blocked for Physio');
  await expect(page.getByTestId('focus-mon-glutes')).toHaveCount(0);

  await generatePlan(page);
  await expect(page.getByTestId('activity-mon')).toContainText('Physio');
});

test('a first-15-minutes physio block is added to training days', async ({ page }) => {
  await page.getByTestId('time-physioMinutes').fill('15');
  await generatePlan(page);
  await tapOrClick(page, 'track-mon');
  await expect(page.getByTestId('tracker')).toBeVisible();
  await expect(page.getByTestId('tracker')).toContainText('Physio');
});
