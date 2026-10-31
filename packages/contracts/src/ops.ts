import {z} from 'zod';
import {uuid} from './spaces.js';
import {moderationRules} from './moderation.js';
export const staffRoles=['MODERATOR','ADMIN','SUPER_ADMIN'] as const;
export type StaffRole=typeof staffRoles[number];
const reason=z.string().trim().min(5).max(300);
export const totpCode=z.strictObject({code:z.string().regex(/^\d{6}$/)});
export const reportDecision=z.discriminatedUnion('outcome',[
 z.strictObject({outcome:z.literal('DISMISS'),type:z.enum(['POST','COMMENT']),id:uuid}),
 z.strictObject({outcome:z.literal('REMOVE'),type:z.enum(['POST','COMMENT']),id:uuid,rule:z.enum(moderationRules)})
]);
export const memberLookup=z.union([z.strictObject({id:uuid}),z.strictObject({email:z.string().trim().toLowerCase().email(),reason})]);
export const reasonInput=z.strictObject({reason});
export const grantInput=z.strictObject({email:z.string().trim().toLowerCase().email(),role:z.enum(staffRoles),expiresAt:z.string().datetime().optional(),reason});
export const revokeInput=z.strictObject({userId:uuid,role:z.enum(staffRoles).optional(),reason});
export interface OpsMe {roles:StaffRole[];name:string;twoFactor:'SETUP'|'REQUIRED'|'OK';}
export interface OpsDashboard {reports:number;spaces:number;feedback:number|null;members:number|null;newMembers:number|null;posts7d:number|null;eventInterest:number|null;helpful:{yes:number;no:number}|null;}
export type Severity='HIGH'|'MEDIUM'|'LOW';
export interface OpsReport {type:'POST'|'COMMENT';id:string;body:string;spaceName:string;author:string|null;reasons:string[];count:number;severity:Severity;createdAt:string;}
export interface OpsMember {id:string;email:string;status:string;joinedAt:string;displayName:string|null;spaces:number;namedPosts:number;reportsOnNamedPosts:number;roles:string[];}
export interface OpsFeedback {id:string;kind:string;page:string|null;moment:string|null;body:string|null;device:string;status:string;contactEmail:string|null;createdAt:string;}
export interface OpsStaff {userId:string;name:string;email:string;twoFactor:boolean;grants:{role:StaffRole;expiresAt:string|null}[];}
export interface OpsAuditEntry {id:string;actor:string;action:string;targetType:string;targetId:string;reason:string|null;at:string;}
