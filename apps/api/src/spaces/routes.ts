import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import {transaction} from '../../../../packages/database/src/database.js';
import * as schema from '../../../../packages/contracts/src/spaces.js';
import {token} from '../../../../packages/contracts/src/auth.js';
import type {AuthService} from '../auth/service.js';
import {authorize} from '../auth/authorization.js';
import {ApiError,invalidSession} from '../core/errors.js';
import {rateLimit} from '../core/rate-limit.js';
import {DevelopmentSafetyClassifier,type SafetyClassifier} from './safety.js';
const fail=(code:string,status=403)=>new ApiError(status,code,'This action is not available.');
const blockedSql=`NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_user_id=$1 AND b.blocked_user_id=p.author_user_id) OR (b.blocked_user_id=$1 AND b.blocker_user_id=p.author_user_id))`;
async function event(tx:Pick<Transaction,'query'>,name:string,spaceId?:string){await tx.query('INSERT INTO space_analytics(id,event,space_id) VALUES($1,$2,$3)',[randomUUID(),name,spaceId??null]);}
export function addSpaces(app:FastifyInstance,db:Database,auth:AuthService,safety:SafetyClassifier=new DevelopmentSafetyClassifier()) {
 if(process.env.NODE_ENV==='production' && safety instanceof DevelopmentSafetyClassifier)throw new Error('Configure a reviewed production safety adapter before enabling Spaces');
 async function run(request:FastifyRequest,work:(tx:Transaction,userId:string)=>Promise<unknown>){
  const parsed=token.safeParse(request.headers.authorization?.replace(/^Bearer /,''));if(!parsed.success)throw invalidSession();
  const user=await auth.authenticate(parsed.data);authorize(user,'member:participate');
  if(request.method!=='GET')await rateLimit(db,`space-write:${user.id}`,60,60);
  const joining=request.method==='POST'&&request.routeOptions.url==='/v1/spaces/:id/join';
  const candidate=joining?schema.uuid.safeParse((request.params as Record<string,string>).id):null;
  const joinId=candidate?.success&&(await db.query('SELECT id FROM support_spaces WHERE id=$1',[candidate.data])).rowCount?candidate.data:undefined;
  if(joinId)await event(db,'official_space_join_started',joinId);
  try{return await transaction(db,async tx=>{
   // One lock order for participation mutations/read projections avoids block/join races in this MVP.
   await tx.query("SELECT pg_advisory_xact_lock(hashtext('sandar-spaces-v1'))");
   const current=await auth.authenticate(parsed.data,tx);authorize(current,'member:participate');
   const completed=(await tx.query('SELECT 1 FROM member_profiles WHERE user_id=$1 AND onboarding_completed_at IS NOT NULL',[current.id])).rowCount;
   if(!completed)throw fail('ONBOARDING_REQUIRED');
   return {data:await work(tx,current.id),error:null};
  });}catch(error){if(joinId)await event(db,'official_space_join_failed',joinId);throw error;}
 }
 async function space(tx:Transaction,userId:string,id:string):Promise<schema.Space>{
  const row=(await tx.query(`SELECT s.*,m.status AS membership FROM support_spaces s LEFT JOIN space_memberships m ON m.space_id=s.id AND m.user_id=$1 WHERE s.id=$2 AND s.kind='OFFICIAL_SANDAR'`,[userId,id])).rows[0];
  if(!row)throw fail('NOT_FOUND',404);
  const joined=row.status==='ACTIVE'&&row.membership==='JOINED';
  return {id:row.id,kind:'OFFICIAL_SANDAR',label:'Official Sandar Space',name:row.name,purpose:row.purpose,audience:row.audience,topic:row.topic,operator:row.operator_name,status:row.status,guidelinesVersion:row.guidelines_version,developmentSample:row.development_sample,membership:row.membership??'NOT_JOINED',permissions:{join:row.status==='ACTIVE'&&!['BANNED','RESTRICTED','JOINED'].includes(row.membership),read:joined,post:joined&&row.posting_enabled,comment:joined&&row.commenting_enabled,anonymous:joined&&row.anonymous_allowed}};
 }
 function requirePermission(s:schema.Space,permission:'read'|'post'|'comment'){
  if(s.status!=='ACTIVE')throw fail('SPACE_RESTRICTED');
  if(!s.permissions.read)throw fail('MEMBERSHIP_REQUIRED');
  if(!s.permissions[permission])throw fail(permission==='post'?'POSTING_DISABLED':'COMMENTING_DISABLED');
 }
 const id=(req:FastifyRequest,name='id')=>schema.uuid.parse((req.params as Record<string,string>)[name]);
 async function post(tx:Transaction,userId:string,postId:string){
  const p=(await tx.query(`SELECT p.* FROM space_posts p WHERE p.id=$2 AND ${blockedSql}`,[userId,postId])).rows[0];
  if(!p||p.status!=='VISIBLE')throw fail('CONTENT_REMOVED',404);
  const s=await space(tx,userId,p.space_id);requirePermission(s,'read');return {p,s};
 }
 async function projectPost(tx:Transaction,userId:string,p:Record<string,unknown>):Promise<schema.SpacePost>{
  const profile=p.identity_mode==='PROFILE'?(await tx.query('SELECT display_name FROM member_profiles WHERE user_id=$1',[p.author_user_id])).rows[0]:null;
  const reactions=(await tx.query('SELECT type FROM space_reactions WHERE post_id=$1 AND user_id=$2',[p.id,userId])).rows;
  return {id:p.id as string,body:p.body as string,identityMode:p.identity_mode as schema.SpacePost['identityMode'],authorName:p.identity_mode==='ANONYMOUS'?'Anonymous Member':p.identity_mode==='ANNOUNCEMENT'?'Sandar Team':profile?.display_name??'Member',createdAt:(p.created_at as Date).toISOString(),own:p.author_user_id===userId,canBlock:Boolean(p.author_user_id&&p.author_user_id!==userId),reactions:(['SUPPORT','RELATE','ENCOURAGEMENT'] as const).map(type=>({type,selected:reactions.some(r=>r.type===type)}))};
 }
 app.get('/v1/spaces',req=>run(req,async(tx,userId)=>{
  const rows=(await tx.query("SELECT id FROM support_spaces WHERE kind='OFFICIAL_SANDAR' ORDER BY created_at,id")).rows;
  return Promise.all(rows.map(r=>space(tx,userId,r.id)));
 }));
 app.get('/v1/spaces/:id',req=>run(req,(tx,userId)=>space(tx,userId,id(req))));
 app.post('/v1/spaces/:id/join',req=>run(req,async(tx,userId)=>{
  const v=schema.joinSpace.parse(req.body),s=await space(tx,userId,id(req));
  if(s.status!=='ACTIVE'||['BANNED','RESTRICTED'].includes(s.membership))throw fail('SPACE_RESTRICTED');
  if(v.guidelinesVersion!==s.guidelinesVersion)throw fail('GUIDELINES_CHANGED',409);
  if(s.membership!=='JOINED'){
   await tx.query(`INSERT INTO space_memberships(space_id,user_id,status,guidelines_version) VALUES($1,$2,'JOINED',$3) ON CONFLICT(space_id,user_id) DO UPDATE SET status='JOINED',guidelines_version=$3,joined_at=now(),left_at=NULL,updated_at=now()`,[s.id,userId,v.guidelinesVersion]);
   await event(tx,'official_space_join_completed',s.id);
  }
  return space(tx,userId,s.id);
 }));
 app.post('/v1/spaces/:id/leave',req=>run(req,async(tx,userId)=>{
  const s=await space(tx,userId,id(req));
  if(s.membership==='JOINED'){
   await tx.query("UPDATE space_memberships SET status='LEFT',left_at=now(),updated_at=now() WHERE space_id=$1 AND user_id=$2",[s.id,userId]);await event(tx,'official_space_left',s.id);
  }
  return space(tx,userId,s.id);
 }));
 app.get('/v1/spaces/:id/posts',req=>run(req,async(tx,userId)=>{
  const s=await space(tx,userId,id(req));requirePermission(s,'read');
  const rows=(await tx.query(`SELECT p.* FROM space_posts p WHERE p.space_id=$2 AND p.status='VISIBLE' AND ${blockedSql} ORDER BY (p.identity_mode='ANNOUNCEMENT') DESC,p.created_at DESC LIMIT 50`,[userId,s.id])).rows;
  return Promise.all(rows.map(p=>projectPost(tx,userId,p)));
 }));
 app.get('/v1/space-posts/:id',req=>run(req,async(tx,userId)=>projectPost(tx,userId,(await post(tx,userId,id(req))).p)));
 app.post('/v1/spaces/:id/posts',req=>run(req,async(tx,userId)=>{
  const v=schema.postInput.parse(req.body),s=await space(tx,userId,id(req));requirePermission(s,'post');
  const profile=(await tx.query('SELECT allow_anonymous_posting FROM member_profiles WHERE user_id=$1',[userId])).rows[0];
  if(v.identityMode==='ANONYMOUS'&&(!s.permissions.anonymous||!profile?.allow_anonymous_posting))throw fail('ANONYMOUS_DISABLED');
  const existing=(await tx.query('SELECT * FROM space_posts WHERE author_user_id=$1 AND request_id=$2',[userId,v.requestId])).rows[0];
  if(existing){if(existing.space_id!==s.id||existing.body!==v.body||existing.identity_mode!==v.identityMode)throw fail('DUPLICATE_REQUEST_CONFLICT',409);return {postId:existing.id,status:existing.status};}
  const result=await safety.classify(v.body);
  if(['BLOCK','REQUIRE_EDIT'].includes(result.requiredAction))throw fail('CONTENT_REQUIRES_EDIT',422);
  const held=result.requiredAction==='ESCALATE'||result.requiresHumanReview;
  const postId=randomUUID();
  await tx.query('INSERT INTO space_posts(id,space_id,author_user_id,identity_mode,body,request_id,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[postId,s.id,userId,v.identityMode,v.body,v.requestId,held?'PENDING_REVIEW':'VISIBLE']);
  if(held)await tx.query('INSERT INTO space_safety_cases(id,space_id,post_id,classification) VALUES($1,$2,$3,$4)',[randomUUID(),s.id,postId,result.classification]);
  await event(tx,v.identityMode==='ANONYMOUS'?'post_created_anonymous':'post_created_named',s.id);
  return {postId,status:held?'PENDING_REVIEW':'VISIBLE'};
 }));
 app.post('/v1/space-posts/:id/reactions',req=>run(req,async(tx,userId)=>{
  const v=schema.reactionInput.parse(req.body),{p,s}=await post(tx,userId,id(req));
  const added=await tx.query('INSERT INTO space_reactions(post_id,user_id,type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[p.id,userId,v.type]);
  if(added.rowCount)await event(tx,'support_reaction_added',s.id);return projectPost(tx,userId,p);
 }));
 app.delete('/v1/space-posts/:id/reactions/:type',req=>run(req,async(tx,userId)=>{
  const v=schema.reactionInput.parse({type:(req.params as Record<string,string>).type}),{p}=await post(tx,userId,id(req));
  await tx.query('DELETE FROM space_reactions WHERE post_id=$1 AND user_id=$2 AND type=$3',[p.id,userId,v.type]);
  return projectPost(tx,userId,p);
 }));
 app.get('/v1/space-posts/:id/comments',req=>run(req,async(tx,userId)=>{
  await post(tx,userId,id(req));
  const rows=(await tx.query(`SELECT p.id,p.body,p.author_user_id,p.created_at,mp.display_name FROM space_comments p JOIN member_profiles mp ON mp.user_id=p.author_user_id WHERE p.post_id=$2 AND p.status='VISIBLE' AND ${blockedSql} ORDER BY p.created_at LIMIT 100`,[userId,id(req)])).rows;
  return rows.map(p=>({id:p.id,body:p.body,authorName:p.display_name,createdAt:p.created_at.toISOString(),own:p.author_user_id===userId,canBlock:p.author_user_id!==userId}));
 }));
 app.post('/v1/space-posts/:id/comments',req=>run(req,async(tx,userId)=>{
  const v=schema.commentInput.parse(req.body),{p,s}=await post(tx,userId,id(req));requirePermission(s,'comment');
  const previous=(await tx.query('SELECT * FROM space_comments WHERE author_user_id=$1 AND request_id=$2',[userId,v.requestId])).rows[0];
  if(previous){if(previous.post_id!==p.id||previous.body!==v.body)throw fail('DUPLICATE_REQUEST_CONFLICT',409);return {commentId:previous.id,status:previous.status};}
  const result=await safety.classify(v.body);if(['BLOCK','REQUIRE_EDIT'].includes(result.requiredAction))throw fail('CONTENT_REQUIRES_EDIT',422);
  const held=result.requiredAction==='ESCALATE'||result.requiresHumanReview,commentId=randomUUID();
  await tx.query('INSERT INTO space_comments(id,post_id,author_user_id,body,request_id,status) VALUES($1,$2,$3,$4,$5,$6)',[commentId,p.id,userId,v.body,v.requestId,held?'PENDING_REVIEW':'VISIBLE']);
  if(held)await tx.query('INSERT INTO space_safety_cases(id,space_id,comment_id,classification) VALUES($1,$2,$3,$4)',[randomUUID(),s.id,commentId,result.classification]);
  await event(tx,'comment_created',s.id);return {commentId,status:held?'PENDING_REVIEW':'VISIBLE'};
 }));
 for(const kind of ['posts','comments'] as const){
  async function target(tx:Transaction,userId:string,targetId:string){
   if(kind==='posts'){const {p,s}=await post(tx,userId,targetId);return {author:p.author_user_id,spaceId:s.id};}
   const c=(await tx.query(`SELECT p.* FROM space_comments p WHERE p.id=$2 AND p.status='VISIBLE' AND ${blockedSql}`,[userId,targetId])).rows[0];
   if(!c)throw fail('CONTENT_REMOVED',404);const {s}=await post(tx,userId,c.post_id);return {author:c.author_user_id,spaceId:s.id};
  }
  app.post(`/v1/space-${kind}/:id/report`,req=>run(req,async(tx,userId)=>{
   const value=schema.reportInput.parse(req.body),targetId=id(req),t=await target(tx,userId,targetId);
   const field=kind==='posts'?'post_id':'comment_id';
   const existing=(await tx.query(`SELECT id FROM content_reports WHERE reporter_user_id=$1 AND ${field}=$2`,[userId,targetId])).rows[0];
   if(existing)return {submitted:true};
   const reportId=randomUUID();await tx.query(`INSERT INTO content_reports(id,reporter_user_id,${field},reason) VALUES($1,$2,$3,$4)`,[reportId,userId,targetId,value.reason]);
   await tx.query('INSERT INTO space_safety_cases(id,space_id,report_id,classification) VALUES($1,$2,$3,$4)',[randomUUID(),t.spaceId,reportId,'MEMBER_REPORT']);
   await event(tx,'content_report_submitted',t.spaceId);return {submitted:true};
  }));
  app.post(`/v1/space-${kind}/:id/block-author`,req=>run(req,async(tx,userId)=>{
   const t=await target(tx,userId,id(req));if(!t.author||t.author===userId)throw fail('BLOCK_UNAVAILABLE');
   const result=await tx.query('INSERT INTO member_blocks(blocker_user_id,blocked_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,t.author]);
   if(result.rowCount)await event(tx,'member_blocked',t.spaceId);return {blocked:true};
  }));
 }
 app.post('/v1/spaces/analytics',req=>run(req,async(tx,userId)=>{
  const v=schema.viewEvent.parse(req.body);if(v.spaceId)await space(tx,userId,v.spaceId);
  await event(tx,v.event,v.spaceId);return {recorded:true};
 }));
}
