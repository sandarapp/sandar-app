import { z } from 'zod';
export const supportedLocales = ['en','id-ID'] as const;
export const defaultMemberLocale = 'en';
export const ageInput = z.strictObject({ confirmed: z.literal(true) });
export const boundariesInput = z.strictObject({ accepted: z.literal(true), locale: z.enum(supportedLocales), policyVersion: z.string().min(1).max(80) });
export const locationInput = z.strictObject({
  source: z.enum(['SKIPPED','MANUAL','DEVICE','DIRECTORY']),
  country: z.string().trim().regex(/^[A-Z]{2}$/).nullable(),
  city: z.string().trim().min(1).max(100).nullable(),
  permission: z.enum(['NOT_REQUESTED','GRANTED','DENIED'])
}).refine(v => v.source === 'SKIPPED' ? v.country === null && v.city === null : Boolean(v.country && v.city), 'Pilih negara dan kota atau lewati lokasi.')
  .refine(v => v.source !== 'DEVICE' || v.permission === 'GRANTED');
export const supportInterests=['ANXIETY_STRESS','BURNOUT','OVERWHELMED','LONELINESS','GRIEF_LOSS','RELATIONSHIPS','PARENTING','LIFE_CHANGES','RECOVERY','WORK_PRESSURE','GENERAL_SUPPORT','OTHER','PREFER_NOT_TO_SAY'] as const;
export const participationPreferences=['FIND_COMMUNITIES','READ_QUIETLY','SHARE_EXPERIENCES','ATTEND_EVENTS','JOIN_PROGRAMS','LEARN_PEER_SUPPORT','STILL_FIGURING_OUT'] as const;
export const needs = [...supportInterests,'CONNECTION','BE_HEARD','EVERYDAY_STRESS','LIFE_TRANSITIONS'] as const;
export const goals = [...participationPreferences,'LISTEN','SHARE','LEARN','PARTICIPATE'] as const;
export const preferencesInput = z.strictObject({ needs: z.array(z.enum(needs)).max(20), goals: z.array(z.enum(goals)).max(20), communityType: z.enum(['NO_PREFERENCE','ONLINE','LOCAL','MIXED']) })
  .refine(v => new Set(v.needs).size === v.needs.length && new Set(v.goals).size === v.goals.length)
  .refine(v => !v.needs.includes('PREFER_NOT_TO_SAY') || v.needs.length===1);
export const interestsInput=z.strictObject({needs:z.array(z.enum(needs)).max(20)}).refine(v=>new Set(v.needs).size===v.needs.length&&(!v.needs.includes('PREFER_NOT_TO_SAY')||v.needs.length===1));
export const participationInput=z.strictObject({goals:z.array(z.enum(goals)).max(20)}).refine(v=>new Set(v.goals).size===v.goals.length);
export const formatInput=z.strictObject({communityType:z.enum(['NO_PREFERENCE','ONLINE','LOCAL','MIXED'])});
export const progressInput=z.strictObject({step:z.number().int().min(0).max(9)});
export const onboardingEvents=['member_onboarding_started','member_onboarding_step_viewed','member_onboarding_step_completed','age_gate_completed','boundaries_acknowledged','location_permission_requested','location_permission_granted','location_permission_denied','location_manual_selected','location_skipped','support_interest_selected','participation_preference_selected','community_format_selected','privacy_preferences_completed','onboarding_review_viewed','member_onboarding_submitted','member_onboarding_completed','member_onboarding_failed'] as const;
export const analyticsInput=z.strictObject({event:z.enum(onboardingEvents),step:z.number().int().min(0).max(10).optional()});
export const privacyInput = z.strictObject({ displayName: z.string().trim().min(1).max(80), language: z.enum(supportedLocales).default(defaultMemberLocale), profileVisibility: z.enum(['HIDDEN','MEMBERS']), directoryVisibility: z.enum(['HIDDEN','DISPLAY_NAME']), allowAnonymousPosting: z.boolean() });
export interface OnboardingState {
  progressStep?: number; interestsSaved?: boolean; participationSaved?: boolean; formatSaved?: boolean;
  ageConfirmed: boolean; boundariesVersion: string | null; boundariesLocale: string | null;
  location: (z.infer<typeof locationInput> & {countryCode?:string|null;countryName?:string|null;cityName?:string|null;locationSource?:string}) | null;
  preferences: z.infer<typeof preferencesInput> | null;
  privacy: z.infer<typeof privacyInput> | null;
  completedAt: string | null;
  policy: { version: string; locale: string } | null;
}
