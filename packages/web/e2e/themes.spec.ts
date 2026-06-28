/**
 * @file packages/web/e2e/themes.spec.ts
 *
 * Theme switching: every theme applies its palette via the `data-theme`
 * attribute, the choice survives a reload, and the accent colour actually
 * changes on screen.
 */

import { expect, test } from '@playwright/test';

import { openApp } from './helpers.ts';

const THEMES = ['pulse', 'grind', 'girlypop', 'minimal'] as const;

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

for (const theme of THEMES) {
  test(`applies the ${theme} theme`, async ({ page }) => {
    await page.getByTestId('theme-picker').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  });
}

test('persists the chosen theme across a reload', async ({ page }) => {
  await page.getByTestId('theme-picker').selectOption('girlypop');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'girlypop');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'girlypop');
  await expect(page.getByTestId('theme-picker')).toHaveValue('girlypop');
});

test('changing theme restyles the accent colour', async ({ page }) => {
  const accentOf = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gf-accent').trim(),
    );
  await page.getByTestId('theme-picker').selectOption('grind');
  const grind = await accentOf();
  await page.getByTestId('theme-picker').selectOption('girlypop');
  const girly = await accentOf();
  expect(grind).not.toBe(girly);
});
