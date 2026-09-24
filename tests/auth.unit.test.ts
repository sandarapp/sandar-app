import { describe, expect, it } from 'vitest';
import { authorize, publicUser } from '../apps/api/src/auth/authorization.js';
import { digest, hashPassword, newToken, verifyPassword } from '../apps/api/src/auth/crypto.js';
import { registration, tokenRequest } from '../packages/contracts/src/auth.js';
import type { User } from '../packages/contracts/src/auth.js';
const user: User = { id: 'sample',email: 'sample@example.invalid',account_type: 'MEMBER',status: 'ONBOARDING_INCOMPLETE',password_hash: 'private',email_verified_at: new Date(),deleted_at: null };
describe('password and token primitives', () => {
  it('salts each password and rejects incorrect values',async () => {
    const a = await hashPassword('test password 123'), b = await hashPassword('test password 123');
    expect(a).not.toBe(b);
    expect(await verifyPassword('test password 123',a)).toBe(true);
    expect(await verifyPassword('wrong',a)).toBe(false);
    expect(await verifyPassword('wrong','malformed')).toBe(false);
  });
  it('generates high-entropy URL-safe tokens and only fixed hashes',() => {
    const token = newToken();
    expect(tokenRequest.parse({ token }).token).toHaveLength(43);
    expect(digest(token)).toHaveLength(64);
    expect(newToken()).not.toBe(token);
  });
});
describe('central authorization and public serialization',() => {
  it('permits self access during onboarding but prevents participation',() => {
    expect(() => authorize(user,'self:read')).not.toThrow();
    expect(() => authorize(user,'onboarding:write')).not.toThrow();
    expect(() => authorize(user,'member:participate')).toThrow();
  });
  it('does not grant a community account member privileges or approval',() => {
    const community: User = { ...user,account_type: 'COMMUNITY' };
    expect(() => authorize(community,'community:apply')).not.toThrow();
    expect(() => authorize(community,'member:participate')).toThrow();
    expect(() => authorize(community,'onboarding:write')).toThrow();
  });
  it.each(['SUSPENDED','DEACTIVATED','DELETED'] as const)('denies %s accounts',status => {
    expect(() => authorize({ ...user,status },'self:read')).toThrow();
  });
  it('denies unverified and soft-deleted users',() => {
    expect(() => authorize({ ...user,email_verified_at: null },'self:read')).toThrow();
    expect(() => authorize({ ...user,deleted_at: new Date() },'self:read')).toThrow();
  });
  it('serializes only explicitly allowed self fields',() => {
    expect(Object.keys(publicUser(user)).sort()).toEqual(['id','email','accountType','status','emailVerifiedAt'].sort());
  });
});
describe('registration contract',() => {
  const body = { email: ' SAMPLE@Example.invalid ',password: 'test password 123',consents: [
    { type: 'TERMS',policyVersion: 'test-v1',locale: 'id-ID',accepted: true },
    { type: 'PRIVACY_NOTICE',policyVersion: 'test-v1',locale: 'id-ID',accepted: true }
  ] };
  it('normalizes email',() => expect(registration.parse(body).email).toBe('sample@example.invalid'));
  it('rejects role injection and duplicate consent types',() => {
    expect(registration.safeParse({ ...body,role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(registration.safeParse({ ...body,consents: [body.consents[0],body.consents[0]] }).success).toBe(false);
  });
});
