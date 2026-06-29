import { describe, expect, it, vi } from 'vitest';

import { consoleEmailSender, createConsoleEmailSender } from '../src/email.ts';

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
