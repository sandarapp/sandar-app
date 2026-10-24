import {ClientError,type PublicUser} from './client.js';
export type CommunityStatus='DRAFT'|'SUBMITTED'|'UNDER_REVIEW'|'NEEDS_MORE_INFORMATION'|'APPROVED'|'REJECTED';
export type IntendedDestination={kind:'space';spaceId:string;postId?:string}|{kind:'community'};
export type Destination={kind:'verification';user:PublicUser}|{kind:'member-onboarding';user:PublicUser}|{kind:'member-home';user:PublicUser;intended?:IntendedDestination}|{kind:'community';user:PublicUser;status:CommunityStatus}|{kind:'denied';user:PublicUser};
export interface RoutingClient {session():Promise<PublicUser>;memberRequest<T>(path:string):Promise<T>}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Strict allowlist. No external return URL, tokens, credentials or arbitrary path. */
export function parseIntended(raw:string,origin:string,expoBase?:string):IntendedDestination|null{
 try{
  const u=new URL(raw);if(u.username||u.password||u.search||u.hash)return null;
  let path:string;
  if(u.protocol==='sandar:')path='/'+u.hostname+u.pathname;
  else if(u.origin===new URL(origin).origin)path=u.pathname;
  else if(expoBase){const base=new URL(expoBase);if(u.protocol!==base.protocol||u.host!==base.host||!base.pathname.endsWith('/--/')||!u.pathname.startsWith(base.pathname))return null;path='/'+u.pathname.slice(base.pathname.length);}
  else return null;
  if(path==='/community/application')return {kind:'community'};
  const parts=path.split('/');if(!['spaces','communities'].includes(parts[1]??'')||!uuid.test(parts[2]??''))return null;
  if(parts.length===3)return {kind:'space',spaceId:parts[2]!};
  if(parts.length===5&&parts[3]==='posts'&&uuid.test(parts[4]??''))return {kind:'space',spaceId:parts[2]!,postId:parts[4]};
  return null;
 }catch{return null;}
}
export async function resolveDestination(client:RoutingClient,intended?:IntendedDestination|null):Promise<Destination>{
 const user=await client.session();
 if(['SUSPENDED','DEACTIVATED','DELETED'].includes(user.status))throw new ClientError('SESSION_INVALID','Session ended',401);
 if(!user.emailVerifiedAt||user.status==='EMAIL_UNVERIFIED')return {kind:'verification',user};
 if(user.accountType==='COMMUNITY'){
  if(intended?.kind==='space')return {kind:'denied',user};
  const state=await client.memberRequest<{status:CommunityStatus}>('/community-applications/me');
  if(!['DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_MORE_INFORMATION','APPROVED','REJECTED'].includes(state.status))throw new ClientError('SERVER_ERROR','Unknown community state');
  return {kind:'community',user,status:state.status};
 }
 if(user.accountType!=='MEMBER')return {kind:'denied',user};
 const onboarding=await client.memberRequest<{completedAt:string|null}>('/users/me/onboarding');
 if(!onboarding.completedAt)return {kind:'member-onboarding',user};
 if(intended?.kind==='community')return {kind:'denied',user};
 if(intended?.kind==='space'){
  const space=await client.memberRequest<{status:string;membership:string;permissions:{read:boolean}}>('/spaces/'+intended.spaceId);
  if(space.status!=='ACTIVE'||['BANNED','RESTRICTED'].includes(space.membership)||(intended.postId&&!space.permissions.read))return {kind:'denied',user};
  if(intended.postId){const posts=await client.memberRequest<{id:string}[]>('/spaces/'+intended.spaceId+'/posts');if(!posts.some(p=>p.id===intended.postId))return {kind:'denied',user};await client.memberRequest('/space-posts/'+intended.postId);}
 }
 return {kind:'member-home',user,...(intended?{intended}:{})};
}
