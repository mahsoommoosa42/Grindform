import { describe, expect, it } from 'vitest';

import { MIGRATIONS } from '../src/bootstrap.ts';

describe('MIGRATIONS', () => {
  it('exposes the ordered migrations with non-empty SQL', () => {
    expect(MIGRATIONS).toHaveLength(2);
    expect(MIGRATIONS[0]?.name).toBe('0000_initial');
    expect(MIGRATIONS[0]?.sqlText).toContain('CREATE TABLE plans');
    expect(MIGRATIONS[1]?.name).toBe('0001_auth');
    expect(MIGRATIONS[1]?.sqlText).toContain('CREATE TABLE users');
  });
});
