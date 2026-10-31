import {z} from 'zod';
// Mood check, feedback, notifications, profile and My spaces.
export const moods=['GREAT','OKAY','MEH','LOW','REALLY_HARD'] as const;
export const moodWords=['CALM','HOPEFUL','GRATEFUL','PROUD','TIRED','RESTLESS','NUMB','ANXIOUS','LONELY','SAD','OVERWHELMED'] as const;
export type Mood=typeof moods[number];
export const moodInput=z.strictObject({mood:z.enum(moods),words:z.array(z.enum(moodWords)).max(3).default([])});
export const moodSettings=z.strictObject({enabled:z.boolean()});
export interface MoodDay {day:string;mood:Mood|null;words:string[];}
export interface MoodState {enabled:boolean;today:MoodDay|null;week:MoodDay[];lowDays:number;}
export const feedbackInput=z.strictObject({
 kind:z.enum(['IDEA','BROKEN','OTHER','HELPFUL','NOT_HELPFUL']),body:z.string().trim().max(1000).optional(),
 page:z.string().regex(/^\/[a-z0-9/-]{0,79}$/).optional(),moment:z.string().regex(/^[a-z-]{1,40}$/).optional(),contactOk:z.boolean().default(false)
}).refine(v=>v.kind==='HELPFUL'||v.kind==='NOT_HELPFUL'||Boolean(v.body),{message:'Text is required'});
export const profileInput=z.strictObject({bio:z.string().trim().max(160)});
export interface MemberNotification {id:string;kind:'REPLY'|'SPACE_REVIEWED';spaceId:string;spaceName:string;actor:string|null;status:string|null;at:string;unread:boolean;}
export interface MySpace {id:string;name:string;kind:'OFFICIAL_SANDAR'|'MEMBER_SPACE'|'PARTNER_COMMUNITY';status:string;hosted:boolean;joined:boolean;memberCount:number;newCount:number;lastPostAt:string|null;preview:{body:string;identityMode:'PROFILE'|'ANONYMOUS'|'ANNOUNCEMENT';authorName:string|null}|null;}
export interface ProfilePost {id:string;body:string;identityMode:'PROFILE'|'ANONYMOUS';spaceId:string;spaceName:string;createdAt:string;commentCount:number;}
export interface MemberProfile {displayName:string;bio:string;joinedAt:string;spaces:{id:string;name:string}[];posts:ProfilePost[];}
