import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import {homeContextInput,homeEventInput,homeVisitInput,type HomeData,type PartnerSummary} from '../../../../packages/contracts/src/home.js';
import {ApiError} from '../core/errors.js';
import {rateLimit} from '../core/rate-limit.js';
import {memberRequest} from '../core/member-request.js';
const denied=()=>new ApiError(403,'RESTRICTED_DESTINATION','This destination is no longer available.');
const notBlocked=`NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_user_id=$1 AND b.blocked_user_id=p.author_user_id) OR (b.blocked_user_id=$1 AND b.blocker_user_id=p.author_user_id))`;
async function metric(tx:Transaction,event:string,resourceId?:string){await tx.query('INSERT INTO member_home_analytics(id,event,resource_id) VALUES($1,$2,$3)',[randomUUID(),event,resourceId??null]);}
export function addMemberHome(app:FastifyInstance,db:Database){
 // Writes keep the Spaces lock order, so state invalidation cannot race a Home projection.
 const run=(req:FastifyRequest,work:(tx:Transaction,userId:string,displayName:string)=>Promise<unknown>)=>memberRequest(db,req,{write:req.method!=='GET',
  onboardingError:()=>new ApiError(403,'ONBOARDING_REQUIRED','Complete onboarding first.'),
  before:req.method!=='GET'?async member=>{await rateLimit(db,'home:'+member.id,120,60);}:undefined},(tx,member)=>work(tx,member.id,member.displayName));
 async function visible(tx:Transaction,userId:string,spaceId:string,joined=false){
  const row=(await tx.query(`SELECT s.id,s.kind FROM support_spaces s LEFT JOIN space_memberships m ON m.space_id=s.id AND m.user_id=$1 WHERE s.id=$2 AND s.status='ACTIVE' AND COALESCE(m.status,'NOT_JOINED') NOT IN ('RESTRICTED','BANNED') AND (s.kind='OFFICIAL_SANDAR' OR NOT s.development_sample) ${joined?"AND m.status='JOINED'":''}`,[userId,spaceId])).rows[0];
  if(!row)throw denied();return row;
 }
 async function validPost(tx:Transaction,userId:string,spaceId:string,postId:string){
  return Boolean((await tx.query(`SELECT 1 FROM space_posts p WHERE p.id=$2 AND p.space_id=$3 AND p.status='VISIBLE' AND ${notBlocked}`,[userId,postId,spaceId])).rowCount);
 }
 app.get('/v1/home',req=>run(req,async(tx,userId,displayName):Promise<HomeData>=>{
  const joined=(await tx.query("SELECT s.id FROM support_spaces s JOIN space_memberships m ON m.space_id=s.id WHERE m.user_id=$1 AND m.status='JOINED' AND s.status='ACTIVE' AND (s.kind='OFFICIAL_SANDAR' OR NOT s.development_sample)",[userId])).rows;
  const partnerRows=(await tx.query("SELECT s.*,COALESCE(m.status,'NOT_JOINED') AS membership FROM support_spaces s LEFT JOIN space_memberships m ON m.space_id=s.id AND m.user_id=$1 WHERE s.kind='PARTNER_COMMUNITY' AND s.status='ACTIVE' AND NOT s.development_sample AND COALESCE(m.status,'NOT_JOINED') NOT IN ('RESTRICTED','BANNED') ORDER BY s.name LIMIT 20",[userId])).rows;
  const partners:PartnerSummary[]=partnerRows.map(r=>({id:r.id,name:r.name,purpose:r.purpose,topic:r.topic,operator:r.operator_name,membership:r.membership}));
  const context=(await tx.query('SELECT * FROM member_home_context WHERE user_id=$1',[userId])).rows[0];
  let continueContext:HomeData['continueContext']=null;
  if(context){
   const allowed=joined.some(s=>s.id===context.space_id);
   if(allowed&&(!context.post_id||await validPost(tx,userId,context.space_id,context.post_id)))continueContext={spaceId:context.space_id,postId:context.post_id,visitedAt:context.visited_at.toISOString()};
   else await tx.query('DELETE FROM member_home_context WHERE user_id=$1',[userId]);
  }
  const activity=(await tx.query(`SELECT p.id,p.space_id,p.created_at FROM space_posts p JOIN support_spaces s ON s.id=p.space_id JOIN space_memberships m ON m.space_id=s.id AND m.user_id=$1 WHERE m.status='JOINED' AND s.kind='OFFICIAL_SANDAR' AND s.status='ACTIVE' AND p.status='VISIBLE' AND ${notBlocked} ORDER BY p.created_at DESC LIMIT 5`,[userId])).rows;
  const visits=(await tx.query('SELECT count(*)::int AS total FROM member_home_visits WHERE user_id=$1',[userId])).rows[0].total;
  return {displayName,firstVisit:visits===0,joinedSpaceIds:joined.map(r=>r.id),partners,events:[],continueContext,recentActivity:activity.map(r=>({spaceId:r.space_id,postId:r.id,createdAt:r.created_at.toISOString()})),capabilities:{events:false,partnerParticipation:false}};
 }));
 app.post('/v1/home/visits',req=>run(req,async(tx,userId)=>{
  const {visitId}=homeVisitInput.parse(req.body);
  const existed=Boolean((await tx.query('SELECT 1 FROM member_home_visits WHERE user_id=$1 LIMIT 1',[userId])).rowCount);
  const inserted=await tx.query('INSERT INTO member_home_visits(user_id,visit_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,visitId]);
  if(inserted.rowCount){await metric(tx,'member_home_viewed');await metric(tx,existed?'member_home_return_view':'member_home_first_view');}
  return {recorded:true};
 }));
 app.post('/v1/home/context',req=>run(req,async(tx,userId)=>{
  const v=homeContextInput.parse(req.body);await visible(tx,userId,v.spaceId,true);
  if(v.postId&&!await validPost(tx,userId,v.spaceId,v.postId))throw denied();
  await tx.query('INSERT INTO member_home_context(user_id,space_id,post_id) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET space_id=$2,post_id=$3,visited_at=now()',[userId,v.spaceId,v.postId??null]);return {saved:true};
 }));
 app.post('/v1/home/analytics',req=>run(req,async(tx,userId)=>{
  const v=homeEventInput.parse(req.body);
  // View classifications are recorded by the idempotent visit endpoint only.
  if(['member_home_viewed','member_home_first_view','member_home_return_view'].includes(v.event))throw new ApiError(400,'INVALID_EVENT','Use a Home visit.');
  if(v.resourceId)await visible(tx,userId,v.resourceId);
  await metric(tx,v.event,v.resourceId);return {recorded:true};
 }));
}
