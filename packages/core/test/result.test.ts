import { describe, expect, it } from 'vitest';

import {
  err,
  isErr,
  isOk,
  mapErr,
  mapResult,
  ok,
  unwrap,
  unwrapErr,
  unwrapOr,
} from '../src/result.ts';

describe('Result constructors and guards', () => {
  it('ok() builds a success and isOk/isErr narrow correctly', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe(42);
  });

  it('err() builds a failure and isOk/isErr narrow correctly', () => {
    const r = err('boom');
    expect(r.ok).toBe(false);
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) expect(r.error).toBe('boom');
  });
});

describe('mapResult / mapErr', () => {
  it('mapResult transforms an ok value', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
  });

  it('mapResult passes an err through untouched', () => {
    const e = err<string>('nope');
    expect(mapResult(e, (n: number) => n * 3)).toBe(e);
  });

  it('mapErr transforms an err value', () => {
    expect(mapErr(err('a'), (s) => `${s}!`)).toEqual(err('a!'));
  });

  it('mapErr passes an ok through untouched', () => {
    const o = ok(5);
    expect(mapErr(o, (s: string) => `${s}!`)).toBe(o);
  });
});

describe('unwrap helpers', () => {
  it('unwrap returns the value on ok', () => {
    expect(unwrap(ok('x'))).toBe('x');
  });

  it('unwrap throws on err', () => {
    expect(() => unwrap(err('bad'))).toThrow('unwrap on err: bad');
  });

  it('unwrapOr returns the value on ok and the fallback on err', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err<number>('e') as never, 9)).toBe(9);
  });

  it('unwrapErr returns the error on err', () => {
    expect(unwrapErr(err('e'))).toBe('e');
  });

  it('unwrapErr throws on ok', () => {
    expect(() => unwrapErr(ok('v'))).toThrow('unwrapErr on ok: v');
  });
});
