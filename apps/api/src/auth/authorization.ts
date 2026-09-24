import type { User } from '../../../../packages/contracts/src/auth.js';
import { ApiError, invalidSession } from '../core/errors.js';
export type Permission = 'self:read' | 'onboarding:write' | 'member:participate' | 'community:apply';
export function requireUsableAccount(user: User) {
  if (user.deleted_at || ['SUSPENDED', 'DEACTIVATED', 'DELETED'].includes(user.status)) throw invalidSession();
}
export function authorize(user: User, permission: Permission) {
  requireUsableAccount(user);
  if (!user.email_verified_at || user.status === 'EMAIL_UNVERIFIED') throw new ApiError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verifikasi email terlebih dahulu.');
  const allowed = permission === 'self:read'
    || (permission === 'onboarding:write' && user.account_type === 'MEMBER')
    || (permission === 'member:participate' && user.account_type === 'MEMBER' && user.status === 'ACTIVE')
    || (permission === 'community:apply' && user.account_type === 'COMMUNITY');
  if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'Anda tidak memiliki akses.');
}
export function publicUser(user: User) {
  return { id: user.id, email: user.email, accountType: user.account_type, status: user.status, emailVerifiedAt: user.email_verified_at };
}
