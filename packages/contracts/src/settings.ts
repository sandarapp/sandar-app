import {z} from 'zod';
import {password} from './auth.js';
// Member settings. Privacy, preferences and location reuse the onboarding inputs.
export const passwordChange=z.strictObject({currentPassword:z.string().min(1).max(128),newPassword:password});
// No name or id: the author may have been blocked from an anonymous post.
export interface BlockedMember {ref:string;blockedAt:string;}
