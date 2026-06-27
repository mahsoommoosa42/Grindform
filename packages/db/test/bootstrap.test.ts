import { describe, expect, it } from 'vitest';

import { MIGRATIONS } from '../src/bootstrap.ts';

describe('MIGRATIONS', () => {
  it('exposes the initial migration with non-empty SQL', () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0]?.name).toBe('0000_initial');
    expect(MIGRATIONS[0]?.sqlText).toContain('CREATE TABLE plans');
  });
});
