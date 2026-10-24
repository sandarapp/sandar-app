import {z} from 'zod';
export const homeEvents=['member_home_viewed','member_home_first_view','member_home_return_view','home_read_quietly_clicked','home_share_experience_clicked','home_find_support_clicked','home_upcoming_events_clicked','official_spaces_section_viewed','recommended_communities_section_viewed','my_spaces_section_viewed','upcoming_events_section_viewed','continue_context_viewed','recent_activity_section_viewed','home_space_card_clicked','home_community_card_clicked','home_event_clicked','home_continue_clicked'] as const;
export const homeEventInput=z.strictObject({event:z.enum(homeEvents),resourceId:z.string().uuid().optional()});
export const homeVisitInput=z.strictObject({visitId:z.string().uuid()});
export const homeContextInput=z.strictObject({spaceId:z.string().uuid(),postId:z.string().uuid().optional()});
export interface HomeContext {spaceId:string;postId:string|null;visitedAt:string;}
export interface HomeActivity {spaceId:string;postId:string;createdAt:string;}
export interface PartnerSummary {id:string;name:string;purpose:string;topic:string;operator:string;membership:'NOT_JOINED'|'JOINED'|'LEFT';}
export interface HomeData {displayName:string;firstVisit:boolean;joinedSpaceIds:string[];partners:PartnerSummary[];events:never[];continueContext:HomeContext|null;recentActivity:HomeActivity[];capabilities:{events:false;partnerParticipation:false};}
