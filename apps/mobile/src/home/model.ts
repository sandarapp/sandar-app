import type {Space} from '../../../../packages/contracts/src/spaces';
export const homeTabs=['home','discover','events','notifications','profile'] as const;
export type HomeTab=typeof homeTabs[number];
export type HomeTarget={tab:HomeTab;search?:string;notice?:string}|{spaceId:string;mode:'space'|'feed'|'compose'|'detail';postId?:string};
export const activeSpaces=(spaces:Space[])=>spaces.filter(s=>s.status==='ACTIVE'&&!['BANNED','RESTRICTED'].includes(s.membership));
export const joinedSpaces=(spaces:Space[])=>activeSpaces(spaces).filter(s=>s.membership==='JOINED'&&s.permissions.read);
export function greeting(hour:number){return hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';}
export function shortcut(kind:'read'|'share'|'find'|'events',spaces:Space[]):HomeTarget{
 if(kind==='events')return {tab:'events'};
 if(kind==='find')return {tab:'discover'};
 const eligible=joinedSpaces(spaces).find(s=>kind==='read'||s.permissions.post);
 return eligible?{spaceId:eligible.id,mode:kind==='read'?'feed':'compose'}:{tab:'discover',notice:kind==='read'?'Choose a space to join and read quietly. Sharing is always optional.':'Choose and join a space before sharing your experience.'};
}
export const homeCopy={partners:'No Partner Communities are available yet. You can explore Official Sandar Spaces.',events:"Nothing upcoming yet. Events are not available in this build.",first:'Welcome to Sandar. Start in the way that feels right for you.'};
