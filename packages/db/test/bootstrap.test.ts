import { describe, expect, it } from 'vitest';

import { MIGRATIONS } from '../src/bootstrap.ts';

describe('MIGRATIONS', () => {
  it('exposes the ordered migrations with non-empty SQL', () => {
    expect(MIGRATIONS).toHaveLength(4);
    expect(MIGRATIONS[0]?.name).toBe('0000_initial');
    expect(MIGRATIONS[0]?.sqlText).toContain('CREATE TABLE plans');
    expect(MIGRATIONS[1]?.name).toBe('0001_auth');
    expect(MIGRATIONS[1]?.sqlText).toContain('CREATE TABLE users');
    expect(MIGRATIONS[2]?.name).toBe('0002_session_idle');
    expect(MIGRATIONS[2]?.sqlText).toContain('ADD COLUMN last_used_at');
    expect(MIGRATIONS[3]?.name).toBe('0003_email_verification');
    expect(MIGRATIONS[3]?.sqlText).toContain('email_verified');
  });
});
