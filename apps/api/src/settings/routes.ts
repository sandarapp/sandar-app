import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import * as onboarding from '../../../../packages/contracts/src/onboarding.js';
import {passwordChange,type BlockedMember} from '../../../../packages/contracts/src/settings.js';
import type {AuthService} from '../auth/service.js';
import {digest} from '../auth/crypto.js';
import {ApiError} from '../core/errors.js';
import {memberRequest} from '../core/member-request.js';
import {rateLimit} from '../core/rate-limit.js';
import {cities,countryName} from '../onboarding/directory.js';

// Changes a member can make after onboarding (WA-08). Every route acts only on
// the account behind the session; nothing takes a user id from the request.
const NAME_CHANGE_DAYS=30;
const bearer=(req:FastifyRequest)=>(req.headers.authorization??'').slice(7);
// An opaque handle for one block, meaningless outside this member's own list.
const blockRef=(blocker:string,blocked:string)=>digest(`block:${blocker}:${blocked}`).slice(0,32);

export function addSettings(app:FastifyInstance,db:Database,auth:AuthService){
 const run=<T>(req:FastifyRequest,write:boolean,work:(tx:Transaction,userId:string)=>Promise<T>,limit:[string,number,number]=['settings',60,60])=>memberRequest(db,req,{write,
  onboardingError:()=>new ApiError(403,'ONBOARDING_REQUIRED','Complete onboarding first.'),
  before:req.method==='GET'?undefined:async member=>{await rateLimit(db,`${limit[0]}:${member.id}`,limit[1],limit[2]);}},(tx,member)=>work(tx,member.id));

 app.patch('/v1/settings/privacy',req=>run(req,true,async(tx,userId)=>{
  const v=onboarding.privacyInput.parse(req.body);
  const now=(await tx.query('SELECT display_name,display_name_changed_at FROM member_profiles WHERE user_id=$1',[userId])).rows[0];
  const renamed=now.display_name!==v.displayName;
  if(renamed&&now.display_name_changed_at&&Date.now()-now.display_name_changed_at.getTime()<NAME_CHANGE_DAYS*86400000)throw new ApiError(409,'DISPLAY_NAME_TOO_SOON','Nama tampilan baru bisa diubah lagi nanti.');
  await tx.query(`UPDATE member_profiles SET display_name=$2,profile_visibility=$3,directory_visibility=$4,allow_anonymous_posting=$5,language=$6,display_name_changed_at=CASE WHEN $7::boolean THEN now() ELSE display_name_changed_at END WHERE user_id=$1`,[userId,v.displayName,v.profileVisibility,v.directoryVisibility,v.allowAnonymousPosting,v.language,renamed]);
  return {saved:true};
 }));
 app.patch('/v1/settings/preferences',req=>run(req,true,async(tx,userId)=>{
  const v=onboarding.preferencesInput.parse(req.body);
  await tx.query('UPDATE member_profiles SET needs=$2,goals=$3,community_type=$4 WHERE user_id=$1',[userId,v.needs,v.goals,v.communityType]);
  return {saved:true};
 }));
 app.patch('/v1/settings/location',req=>run(req,true,async(tx,userId)=>{
  const v=onboarding.locationInput.parse(req.body);
  if(v.country&&!countryName(v.country))throw new ApiError(400,'VALIDATION_ERROR','Choose a valid country.');
  if(v.source==='DIRECTORY'&&!(cities[v.country!]??[]).includes(v.city!))throw new ApiError(400,'VALIDATION_ERROR','Choose a city from this country or use manual entry.');
  await tx.query('UPDATE member_profiles SET location_source=$2,country=$3,city=$4,location_permission=$5,country_name=$6 WHERE user_id=$1',[userId,v.source,v.country,v.city,v.permission,countryName(v.country)]);
  return {saved:true};
 }));
 // Password hashing is slow, so this holds no shared lock. Tight limit: it checks a password.
 app.post('/v1/settings/password',req=>run(req,false,async(_tx,userId)=>{
  const v=passwordChange.parse(req.body);
  return auth.changePassword(userId,bearer(req),v.currentPassword,v.newPassword);
 },['settings-password',5,900]));
 app.post('/v1/settings/sessions/revoke-others',req=>run(req,false,async(_tx,userId)=>auth.revokeOtherSessions(userId,bearer(req))));
 app.get('/v1/settings/blocks',req=>run(req,false,async(tx,userId):Promise<BlockedMember[]>=>
  (await tx.query('SELECT blocked_user_id,created_at FROM member_blocks WHERE blocker_user_id=$1 ORDER BY created_at DESC',[userId])).rows.map(r=>({ref:blockRef(userId,r.blocked_user_id),blockedAt:r.created_at.toISOString()}))));
 app.post('/v1/settings/blocks/:ref/unblock',req=>run(req,true,async(tx,userId)=>{
  const ref=(req.params as Record<string,string>).ref;
  const rows=(await tx.query('SELECT blocked_user_id FROM member_blocks WHERE blocker_user_id=$1',[userId])).rows;
  const hit=rows.find(r=>blockRef(userId,r.blocked_user_id)===ref);
  if(!hit)throw new ApiError(404,'NOT_FOUND','Tidak ditemukan.');
  await tx.query('DELETE FROM member_blocks WHERE blocker_user_id=$1 AND blocked_user_id=$2',[userId,hit.blocked_user_id]);
  return {unblocked:true};
 }));
}
