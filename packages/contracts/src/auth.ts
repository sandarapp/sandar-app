import { z } from 'zod';
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(12).max(128);
export const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const registration = z.strictObject({
  email, password,
  consents: z.array(z.strictObject({
    type: z.enum(['TERMS', 'PRIVACY_NOTICE']),
    policyVersion: z.string().min(1).max(80),
    locale: z.enum(['en','id-ID']),
    accepted: z.literal(true)
  })).length(2).refine(items => new Set(items.map(i => i.type)).size === 2)
});
export const login = z.strictObject({ email, password: z.string().min(1).max(128) });
export const emailRequest = z.strictObject({ email });
export const tokenRequest = z.strictObject({ token });
export const refreshRequest = z.strictObject({ refreshToken: token });
export const resetRequest = z.strictObject({ token, password });
export type Registration = z.infer<typeof registration>;
export type AccountType = 'MEMBER' | 'COMMUNITY';
export type UserStatus = 'EMAIL_UNVERIFIED' | 'EMAIL_VERIFIED' | 'ONBOARDING_INCOMPLETE' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | 'DELETED';
export interface User {
  id: string; email: string; account_type: AccountType; status: UserStatus;
  password_hash: string; email_verified_at: Date | null; deleted_at: Date | null;
}
