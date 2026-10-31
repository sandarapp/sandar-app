import {z} from 'zod';
import {discoveryTopics} from './discovery.js';
import {uuid} from './spaces.js';
// A space a member starts. Accepting the host pledge is required to send it.
export const memberSpaceLimit=2;
export const memberSpaceGuidelines='member-space-v1';
export const memberSpaceInput=z.strictObject({
 requestId:uuid,name:z.string().trim().min(3).max(40),purpose:z.string().trim().min(10).max(200),
 topics:z.array(z.enum(discoveryTopics)).min(1).max(2),anonymousAllowed:z.boolean(),
 rules:z.array(z.string().trim().min(3).max(140)).min(1).max(8),pledge:z.literal(true)
});
export type MemberSpaceStatus='IN_REVIEW'|'NEEDS_CHANGES'|'NOT_APPROVED'|'ACTIVE'|'RESTRICTED';
export interface MemberSpaceSummary {id:string;name:string;status:MemberSpaceStatus;reviewNote:string|null;}
