import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../src/passwords.ts';

describe('password hashing', () => {
  it('produces a verifiable $scrypt$ envelope', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash.startsWith('$scrypt$N=32768,r=8,p=1$')).toBe(true);
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
  });

  it('salts each hash so identical passwords differ', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('returns false for a hash without the format prefix', async () => {
    expect(await verifyPassword('x', 'not-a-scrypt-hash')).toBe(false);
  });

  it('returns false when the envelope has the wrong number of fields', async () => {
    expect(await verifyPassword('x', '$scrypt$N=32768,r=8,p=1$only-salt')).toBe(false);
  });

  it('returns false when a field is empty', async () => {
    expect(await verifyPassword('x', '$scrypt$N=1,r=8,p=1$$aGFzaA==')).toBe(false);
  });

  it('returns false when a parameter pair is malformed', async () => {
    expect(await verifyPassword('x', '$scrypt$=32768$c2FsdA==$aGFzaA==')).toBe(false);
  });

  it('returns false when a parameter value is non-positive', async () => {
    expect(await verifyPassword('x', '$scrypt$N=0,r=8,p=1$c2FsdA==$aGFzaA==')).toBe(false);
  });

  it('returns false when a required parameter is missing', async () => {
    expect(await verifyPassword('x', '$scrypt$r=8,p=1$c2FsdA==$aGFzaA==')).toBe(false);
  });
});
