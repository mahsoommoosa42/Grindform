/**
 * @file packages/api/src/test-hooks.ts
 *
 * Test-only helpers gated behind the `GRINDFORM_TEST_HOOKS` env var.
 * Exposes the last verification URL emitted by the console email sender
 * so Playwright e2e tests can complete the verify flow without parsing
 * server stdout.
 */

import type { EmailSender } from './email.ts';
import { createConsoleEmailSender } from './email.ts';

/** Last verification email captured by the test sender, keyed by recipient. */
const sentUrls = new Map<string, string>();

/** A console email sender that also captures URLs for the test hook. */
export const testEmailSender: EmailSender = createConsoleEmailSender((to, url) => {
  sentUrls.set(to, url);
});

/** Get the most recently sent verification URL for `email`, if any. */
export const getLastVerifyUrl = (email: string): string | undefined => sentUrls.get(email);
