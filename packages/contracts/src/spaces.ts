import {z} from 'zod';
export const uuid=z.string().uuid();
export const joinSpace=z.strictObject({accepted:z.literal(true),guidelinesVersion:z.string().min(1).max(80)});
export const postInput=z.strictObject({requestId:uuid,identityMode:z.enum(['PROFILE','ANONYMOUS']),body:z.string().trim().min(1).max(1000)});
export const commentInput=z.strictObject({requestId:uuid,body:z.string().trim().min(1).max(1000)});
export const reactionInput=z.strictObject({type:z.enum(['SUPPORT','RELATE','ENCOURAGEMENT'])});
export const reportInput=z.strictObject({reason:z.enum(['HARMFUL_CONTENT','HARASSMENT','PRIVACY','MISINFORMATION','OTHER'])});
export const viewEvent=z.strictObject({event:z.enum(['official_spaces_viewed','official_space_card_viewed','official_space_profile_viewed','official_space_guidelines_viewed','space_feed_viewed','post_create_started','content_report_started']),spaceId:uuid.optional()});
export type Membership='NOT_JOINED'|'JOINED'|'LEFT'|'RESTRICTED'|'BANNED';
export interface Space {id:string;kind:'OFFICIAL_SANDAR';label:'Official Sandar Space';name:string;purpose:string;audience:string;topic:string;operator:string;status:'ACTIVE'|'RESTRICTED';guidelinesVersion:string;developmentSample:boolean;membership:Membership;permissions:{join:boolean;read:boolean;post:boolean;comment:boolean;anonymous:boolean};}
export interface SpacePost {id:string;body:string;identityMode:'PROFILE'|'ANONYMOUS'|'ANNOUNCEMENT';authorName:string;createdAt:string;own:boolean;canBlock:boolean;reactions:{type:'SUPPORT'|'RELATE'|'ENCOURAGEMENT';selected:boolean}[];}
export interface SpaceComment {id:string;body:string;authorName:string;createdAt:string;own:boolean;canBlock:boolean;}
export const guidelines=['Be kind and respectful. Share with empathy.','Support, do not diagnose or give medical advice.','Respect privacy. Do not share personal information about others.','Stay on topic and respect different experiences.','Report harmful content so it can be reviewed.'];
