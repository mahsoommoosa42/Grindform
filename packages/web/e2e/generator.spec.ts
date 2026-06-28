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

test('focus chips toggle on a training session', async ({ page }) => {
  const quads = page.getByTestId('focus-mon-0-quads');
  await expect(quads).toHaveAttribute('aria-pressed', 'false');
  await tapOrClick(page, 'focus-mon-0-quads');
  await expect(quads).toHaveAttribute('aria-pressed', 'true');
});

test('adding an external activity session surfaces it in the generated plan', async ({ page }) => {
  // Monday starts as a single training session; add an evening run alongside it.
  await tapOrClick(page, 'add-external-mon');
  await page.getByTestId('session-activity-mon-1').selectOption('run');
  await page.getByTestId('session-minutes-mon-1').fill('30');

  await generatePlan(page);
  const monday = page.getByTestId('card-mon');
  await expect(monday).toContainText('Main lift'); // the training session
  await expect(monday).toContainText('Run'); // the external session
});

test('an empty day generates a rest-day card', async ({ page }) => {
  // Remove Monday's only (training) session, leaving the day empty.
  await tapOrClick(page, 'remove-session-mon-0');
  await expect(page.getByTestId('rest-mon')).toContainText('Rest day');

  await generatePlan(page);
  await expect(page.getByTestId('rest-card-mon')).toContainText('Rest day');
});

test('the default physio minutes add a physio block to training sessions', async ({ page }) => {
  await page.getByTestId('time-physioMinutes').fill('15');
  await generatePlan(page);
  await tapOrClick(page, 'track-mon');
  await expect(page.getByTestId('tracker')).toBeVisible();
  await expect(page.getByTestId('tracker')).toContainText('Physio');
});

test('per-session physio placement moves the physio block within a session', async ({ page }) => {
  // Override Monday's training session: 12 min physio, placed at the very end.
  await page.getByTestId('time-override-mon-0').click();
  await page.getByTestId('override-physio-mon-0').fill('12');
  await page.getByTestId('override-physio-pos-mon-0').selectOption('4');

  await generatePlan(page);
  await tapOrClick(page, 'track-mon');
  await expect(page.getByTestId('tracker')).toBeVisible();
  await expect(page.getByTestId('tracker')).toContainText('Physio');
});
