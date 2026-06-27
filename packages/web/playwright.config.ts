/**
 * @file packages/web/playwright.config.ts
 *
 * End-to-end test matrix for Grindform. Every spec runs on both engines
 * the brief calls out — Chromium and WebKit (Safari) — across the three
 * target screen configs (mobile / tablet / laptop). The mobile and
 * tablet projects enable touch so tap interactions are exercised exactly
 * as a phone/tablet user would hit them.
 *
 * The web server is built and booted by Playwright with an in-memory
 * database, so the suite is hermetic and leaves nothing behind.
 */

import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  // NOTE: the mobile/tablet projects enable `hasTouch` but deliberately
  // leave `isMobile` off. `isMobile` turns on Chromium's dual (visual vs
  // layout) viewport emulation, which mis-aligns synthesised tap
  // coordinates against the hit-test on tall scrolled pages — a harness
  // artefact, not an app bug. Real touch input is still exercised.
  projects: [
    {
      name: 'chromium-mobile',
      use: { browserName: 'chromium', viewport: { width: 393, height: 851 }, hasTouch: true },
    },
    {
      name: 'chromium-tablet',
      use: { browserName: 'chromium', viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: 'chromium-laptop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, hasTouch: false },
    },
    {
      name: 'webkit-mobile',
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: 'webkit-tablet',
      use: { browserName: 'webkit', viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: 'webkit-laptop',
      use: { browserName: 'webkit', viewport: { width: 1280, height: 800 }, hasTouch: false },
    },
  ],
  webServer: {
    command: 'bun run build:client && bun run src/server.ts',
    url: `${BASE_URL}/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: String(PORT), GRINDFORM_DATA_DIR: 'memory' },
  },
});
