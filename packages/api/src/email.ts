/**
 * @file packages/api/src/email.ts
 *
 * Pluggable email sender abstraction. The default {@link consoleEmailSender}
 * logs verification links to stdout so the app runs with zero external
 * config. Set `RESEND_API_KEY` (and optionally `GRINDFORM_EMAIL_FROM`) to
 * use the {@link createResendEmailSender Resend} provider for real delivery.
 */

import { Resend } from 'resend';

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

/** Options for the Resend-backed sender. */
export interface ResendEmailSenderOptions {
  /** Resend API key (`re_…`). */
  readonly apiKey: string;
  /**
   * `From` header, e.g. `"Grindform <noreply@grindform.com>"`.
   * Defaults to `"Grindform <onboarding@resend.dev>"` (Resend's
   * shared test domain — works immediately, but may land in spam).
   */
  readonly from?: string;
}

/**
 * Production sender backed by the Resend transactional email API.
 * Throws on send failure so the caller can surface the error.
 */
export const createResendEmailSender = (opts: ResendEmailSenderOptions): EmailSender => {
  const resend = new Resend(opts.apiKey);
  const from = opts.from ?? 'Grindform <onboarding@resend.dev>';

  return {
    async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
      const { error } = await resend.emails.send({
        from,
        to,
        subject: 'Verify your Grindform email',
        text:
          `Welcome to Grindform!\n\n` +
          `Click the link below to verify your email address:\n\n` +
          `${verifyUrl}\n\n` +
          `This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.`,
      });
      if (error) {
        throw new Error(`Resend API error: ${error.message}`);
      }
    },
  };
};
