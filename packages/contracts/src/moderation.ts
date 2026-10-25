import {z} from 'zod';
// Moderation of member posts. Rules match the five Community Guidelines in
// order; OTHER needs no further text, so no free text reaches the log.
export const moderationRules=['RULE_1','RULE_2','RULE_3','RULE_4','RULE_5','OTHER'] as const;
export const postDecision=z.discriminatedUnion('decision',[
 z.strictObject({decision:z.literal('APPROVE')}),
 z.strictObject({decision:z.literal('REMOVE'),rule:z.enum(moderationRules)})
]);
export interface QueuedPost {postId:string;spaceId:string;spaceName:string;body:string;identityMode:'PROFILE'|'ANONYMOUS';authorName:string|null;createdAt:string;highConcern:boolean;}
export interface OpenReport {reportId:string;reason:'HARMFUL_CONTENT'|'HARASSMENT'|'PRIVACY'|'MISINFORMATION'|'OTHER';createdAt:string;postId:string;postBody:string;spaceName:string;reportsOnPost:number;}
export interface ModerationQueue {posts:QueuedPost[];reports:OpenReport[];}
