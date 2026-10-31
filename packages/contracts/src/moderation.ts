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
// The note is shown to the host, so changes and rejections must explain themselves.
export const spaceDecision=z.discriminatedUnion('decision',[
 z.strictObject({decision:z.literal('APPROVE')}),
 z.strictObject({decision:z.enum(['CHANGES','REJECT']),note:z.string().trim().min(5).max(300)})
]);
export interface QueuedSpace {spaceId:string;name:string;purpose:string;topics:string[];rules:string[];anonymousAllowed:boolean;hostName:string;createdAt:string;}
export interface ModerationQueue {posts:QueuedPost[];reports:OpenReport[];spaces:QueuedSpace[];}
