import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  ForbiddenError,
  GrindformError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
  isGrindformError,
  toErrorPayload,
} from '../src/errors.ts';

describe('error subclasses carry stable code + httpStatus', () => {
  const cases = [
    { Cls: ValidationError, code: 'VALIDATION', status: 400 },
    { Cls: UnauthorizedError, code: 'UNAUTHORIZED', status: 401 },
    { Cls: ForbiddenError, code: 'FORBIDDEN', status: 403 },
    { Cls: NotFoundError, code: 'NOT_FOUND', status: 404 },
    { Cls: ConflictError, code: 'CONFLICT', status: 409 },
    { Cls: RateLimitedError, code: 'RATE_LIMITED', status: 429 },
  ] as const;

  for (const { Cls, code, status } of cases) {
    it(`${code} → HTTP ${status}`, () => {
      const e = new Cls('boom');
      expect(e).toBeInstanceOf(GrindformError);
      expect(e.code).toBe(code);
      expect(e.httpStatus).toBe(status);
      expect(e.name).toBe(Cls.name);
      expect(e.message).toBe('boom');
    });
  }
});

describe('isGrindformError', () => {
  it('is true for our errors and false otherwise', () => {
    expect(isGrindformError(new NotFoundError('x'))).toBe(true);
    expect(isGrindformError(new Error('x'))).toBe(false);
    expect(isGrindformError('x')).toBe(false);
  });
});

describe('toErrorPayload', () => {
  it('reflects code + message for a domain error without details', () => {
    expect(toErrorPayload(new NotFoundError('missing'))).toEqual({
      code: 'NOT_FOUND',
      message: 'missing',
    });
  });

  it('includes details when present', () => {
    expect(toErrorPayload(new ValidationError('bad', { field: 'goal' }))).toEqual({
      code: 'VALIDATION',
      message: 'bad',
      details: { field: 'goal' },
    });
  });

  it('collapses unknown throws to a generic INTERNAL payload', () => {
    expect(toErrorPayload(new Error('secret stack'))).toEqual({
      code: 'INTERNAL',
      message: 'Internal error',
    });
    expect(toErrorPayload('plain string')).toEqual({
      code: 'INTERNAL',
      message: 'Internal error',
    });
  });
});
