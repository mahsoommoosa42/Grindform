import { describe, expect, it } from 'vitest';

import type { Email } from '@grindform/core';

import { parseAdminEmails, roleForEmail } from '../src/admin.ts';

const email = (s: string): Email => s as Email;

describe('admin allowlist', () => {
  it('parses, trims, lowercases, and drops blanks', () => {
    const set = parseAdminEmails(' Owner@Example.com , ,support@example.com ');
    expect([...set]).toEqual(['owner@example.com', 'support@example.com']);
  });

  it('yields an empty set for undefined or empty input', () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails('').size).toBe(0);
    expect(parseAdminEmails('   ').size).toBe(0);
  });

  it('grants admin only to allowlisted emails', () => {
    const set = parseAdminEmails('owner@example.com');
    expect(roleForEmail(email('owner@example.com'), set)).toBe('admin');
    expect(roleForEmail(email('member@example.com'), set)).toBe('member');
  });
});
