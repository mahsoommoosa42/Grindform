/**
 * @file packages/api/src/email.ts
 *
 * Pluggable email sender abstraction. The default {@link consoleEmailSender}
 * logs verification links to stdout so the app runs with zero external
 * config. Wire a real provider (SendGrid, SES, Postmark, etc.) by
 * implementing {@link EmailSender} and passing it to the auth routes via
 * deps — gated behind `GRINDFORM_EMAIL_*` env vars.
 */

/** The contract every email sender must satisfy. */
export interface EmailSender {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
}

/**
 * Dev/test sender: prints the verification link to the console.
 * In test mode an optional `onSend` callback captures the URL.
 */
export const createConsoleEmailSender = (
  onSend?: (to: string, verifyUrl: string) => void,
): EmailSender => ({
  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[email] Verification link for ${to}: ${verifyUrl}`);
    onSend?.(to, verifyUrl);
  },
});

/** Singleton console sender for production (no callback). */
export const consoleEmailSender: EmailSender = createConsoleEmailSender();
