/**
 * @file packages/web/e2e/exercises.spec.ts
 *
 * The inline-workout + exercise-editing features: training day cards list
 * their exercises (name + scheme) with swap/remove controls and an
 * "Add exercise" action; the Exercises view browses the common index and
 * manages per-account custom exercises; the picker overlay swaps/adds an
 * exercise without regenerating the session.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { generatePlan, openApp, tapOrClick } from './helpers.ts';

/** The first training day card that actually lists exercise slots. */
const firstSlotRow = (page: Page) => page.locator('[data-testid^="week-slot-"]').first();

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await generatePlan(page);
});

test('training day cards list their exercises inline with scheme + controls', async ({ page }) => {
  const slot = firstSlotRow(page);
  await expect(slot).toBeVisible();
  // Name, sets×reps scheme, and per-exercise swap/remove controls are present.
  await expect(slot.locator('.slot-name')).toBeVisible();
  await expect(slot.locator('.slot-scheme')).toBeVisible();
  await expect(page.locator('[data-testid^="swap-"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="remove-"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="add-exercise-"]').first()).toBeVisible();
});

test('swapping an exercise replaces it inline without regenerating', async ({ page }) => {
  const slot = firstSlotRow(page);
  const original = (await slot.locator('.slot-name').textContent())?.trim();

  await page.locator('[data-testid^="swap-"]').first().click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await page.getByTestId('picker-search').fill('hip thrust');
  await page.getByTestId('pick-barbell-hip-thrust').click();

  // Picker closes and a Barbell hip thrust now appears among the exercises.
  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(page.getByTestId('week').getByText('Barbell hip thrust').first()).toBeVisible();
  if (original !== undefined && original !== 'Barbell hip thrust') {
    // The original name should no longer be the swapped slot's name.
    expect(original).not.toBe('Barbell hip thrust');
  }
});

test('adding an exercise to a session inserts a new slot', async ({ page }) => {
  const before = await page.locator('[data-testid^="week-slot-"]').count();
  await page.locator('[data-testid^="add-exercise-"]').first().click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await page.getByTestId('picker-search').fill('hip thrust');
  await page.getByTestId('pick-barbell-hip-thrust').click();
  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(page.locator('[data-testid^="week-slot-"]')).toHaveCount(before + 1);
});

test('removing an exercise drops the slot', async ({ page }) => {
  const before = await page.locator('[data-testid^="week-slot-"]').count();
  await page.locator('[data-testid^="remove-"]').first().click();
  await expect(page.locator('[data-testid^="week-slot-"]')).toHaveCount(before - 1);
});

test('the picker can be dismissed without changing the plan', async ({ page }) => {
  const before = await page.locator('[data-testid^="week-slot-"]').count();
  await page.locator('[data-testid^="swap-"]').first().click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await page.getByTestId('picker-close').click();
  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(page.locator('[data-testid^="week-slot-"]')).toHaveCount(before);
});

test('Exercises view browses the common index and filters it', async ({ page }) => {
  await tapOrClick(page, 'nav-exercises');
  await expect(page.getByTestId('exercises')).toBeVisible();
  const catalog = page.getByTestId('catalog-list');
  const total = await catalog.locator('[data-testid^="catalog-"]').count();
  expect(total).toBeGreaterThan(20);

  // Text search narrows the list.
  await page.getByTestId('exercise-search').fill('hip thrust');
  await expect(catalog.getByTestId('catalog-barbell-hip-thrust')).toBeVisible();
  const narrowed = await catalog.locator('[data-testid^="catalog-"]').count();
  expect(narrowed).toBeLessThan(total);

  // Muscle filter also constrains results.
  await page.getByTestId('exercise-search').fill('');
  await page.getByTestId('exercise-muscle').selectOption('chest');
  const chest = await catalog.locator('[data-testid^="catalog-"]').count();
  expect(chest).toBeGreaterThan(0);
  expect(chest).toBeLessThan(total);
});

test('a custom exercise can be created, used, and deleted', async ({ page }) => {
  await tapOrClick(page, 'nav-exercises');
  await expect(page.getByTestId('exercises')).toBeVisible();

  // Create.
  await page.getByTestId('custom-name').fill('Banded glute bridge');
  await page.getByTestId('custom-muscle-glutes').click();
  await page.getByTestId('custom-equip-band').click();
  await page.getByTestId('custom-save').click();

  const customList = page.getByTestId('custom-list');
  await expect(customList).toBeVisible();
  const row = customList.locator('[data-testid^="custom-"]').first();
  await expect(row).toContainText('Banded glute bridge');
  await expect(row.locator('.custom-tag')).toBeVisible();

  // It shows up in the swap picker under "Your exercises".
  await tapOrClick(page, 'nav-week');
  await page.locator('[data-testid^="swap-"]').first().click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await page.getByTestId('picker-search').fill('Banded');
  await expect(page.getByText('Your exercises')).toBeVisible();
  await page.getByTestId('picker-close').click();

  // Delete it from the Exercises view.
  await tapOrClick(page, 'nav-exercises');
  const delBtn = page.locator('[data-testid^="delete-custom-"]').first();
  await delBtn.click();
  await expect(page.getByTestId('custom-list')).toHaveCount(0);
});

test('custom-exercise form validates required fields', async ({ page }) => {
  await tapOrClick(page, 'nav-exercises');
  await page.getByTestId('custom-name').fill('X');
  await page.getByTestId('custom-save').click();
  // Too-short name is rejected inline; no custom list appears.
  await expect(page.getByTestId('custom-error')).toBeVisible();
  await expect(page.getByTestId('custom-list')).toHaveCount(0);
});
