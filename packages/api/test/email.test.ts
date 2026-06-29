import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consoleEmailSender,
  createConsoleEmailSender,
  createResendEmailSender,
} from '../src/email.ts';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

describe('email sender', () => {
  it('consoleEmailSender logs the verification link', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await consoleEmailSender.sendVerificationEmail('a@b.com', 'https://example.com/verify?t=abc');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('a@b.com'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('https://example.com/verify?t=abc'));
    spy.mockRestore();
  });

  it('createConsoleEmailSender fires the onSend callback', async () => {
    const calls: [string, string][] = [];
    const sender = createConsoleEmailSender((to, url) => calls.push([to, url]));
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sender.sendVerificationEmail('x@y.com', 'http://localhost/?verify=tok');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['x@y.com', 'http://localhost/?verify=tok']);
    spy.mockRestore();
  });
});

describe('resend email sender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('instantiates Resend with the provided API key', async () => {
    const { Resend } = await import('resend');
    createResendEmailSender({ apiKey: 're_test_123' });
    expect(Resend).toHaveBeenCalledWith('re_test_123');
  });

  it('sends a verification email via Resend with default from', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'email_1' }, error: null });
    const sender = createResendEmailSender({ apiKey: 're_test_123' });
    await sender.sendVerificationEmail('user@test.com', 'https://app.grindform.com/?verify=tok');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Grindform <onboarding@resend.dev>',
        to: 'user@test.com',
        subject: 'Verify your Grindform email',
        text: expect.stringContaining('https://app.grindform.com/?verify=tok'),
      }),
    );
  });

  it('uses a custom from address when provided', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'email_2' }, error: null });
    const sender = createResendEmailSender({
      apiKey: 're_test_456',
      from: 'Grindform <noreply@grindform.com>',
    });
    await sender.sendVerificationEmail('user@test.com', 'https://x.com/?verify=abc');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Grindform <noreply@grindform.com>' }),
    );
  });

  it('throws when the Resend API returns an error', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Missing `to` field' },
    });
    const sender = createResendEmailSender({ apiKey: 're_test_789' });
    await expect(
      sender.sendVerificationEmail('bad@test.com', 'https://x.com/?verify=tok'),
    ).rejects.toThrow('Resend API error: Missing `to` field');
  });
});
