import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import * as schema from '../../../../packages/contracts/src/spaces.js';
import {ApiError} from '../core/errors.js';
import {rateLimit} from '../core/rate-limit.js';
import {memberRequest} from '../core/member-request.js';
import {DevelopmentSafetyClassifier,type SafetyClassifier,type SafetyResult} from './safety.js';
// English when the request asks for it; otherwise the Indonesian original.
export const contentLocale=(req:FastifyRequest)=>/^en\b/i.test(String(req.headers['accept-language']??''))?'en':'id-ID';
const fail=(code:string,status=403)=>new ApiError(status,code,'This action is not available.');
const blockedSql=`NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_user_id=$1 AND b.blocked_user_id=p.author_user_id) OR (b.blocked_user_id=$1 AND b.blocker_user_id=p.author_user_id))`;
async function event(tx:Pick<Transaction,'query'>,name:string,spaceId?:string){await tx.query('INSERT INTO space_analytics(id,event,space_id) VALUES($1,$2,$3)',[randomUUID(),name,spaceId??null]);}
export function addSpaces(app:FastifyInstance,db:Database,safety:SafetyClassifier=new DevelopmentSafetyClassifier()) {
 if(process.env.NODE_ENV==='production' && safety instanceof DevelopmentSafetyClassifier)throw new Error('Configure a reviewed production safety adapter before enabling Spaces');
 async function run(request:FastifyRequest,work:(tx:Transaction,userId:string)=>Promise<unknown>){
  const write=request.method!=='GET';
  const joining=request.method==='POST'&&request.routeOptions.url==='/v1/spaces/:id/join';
  let joinId:string|undefined;
  try{return await memberRequest(db,request,{write,onboardingError:()=>fail('ONBOARDING_REQUIRED'),before:write?async member=>{
   await rateLimit(db,`space-write:${member.id}`,60,60);
   const candidate=joining?schema.uuid.safeParse((request.params as Record<string,string>).id):null;
   joinId=candidate?.success&&(await db.query('SELECT id FROM support_spaces WHERE id=$1',[candidate.data])).rowCount?candidate.data:undefined;
   if(joinId)await event(db,'official_space_join_started',joinId);
  }:undefined},(tx,member)=>work(tx,member.id));}
  catch(error){if(joinId)await event(db,'official_space_join_failed',joinId);throw error;}
 }
 const spaceSql=`SELECT s.*,COALESCE(t.name,s.name) AS name,COALESCE(t.purpose,s.purpose) AS purpose,COALESCE(t.audience,s.audience) AS audience,COALESCE(t.topic,s.topic) AS topic,m.status AS membership,$1::uuid AS viewer_id
   FROM support_spaces s LEFT JOIN space_memberships m ON m.space_id=s.id AND m.user_id=$1 LEFT JOIN support_space_translations t ON t.space_id=s.id AND t.locale=$2
   WHERE (s.kind='OFFICIAL_SANDAR' OR (s.kind='MEMBER_SPACE' AND (s.status='ACTIVE' OR s.host_user_id=$1)))`;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any -- database row
 function projectSpace(row:Record<string,any>):schema.Space{
  const joined=row.status==='ACTIVE'&&row.membership==='JOINED';
  // Every onboarded member can read an active space; posting and replying follow the join, which accepts the guidelines.
  const shut=['BANNED','RESTRICTED'].includes(row.membership);
  const hostedByMe=row.host_user_id===row.viewer_id;
  return {id:row.id,kind:row.kind,label:row.kind==='MEMBER_SPACE'?'Member space':'Official Sandar Space',name:row.name,purpose:row.purpose,audience:row.audience,topic:row.topic,operator:row.operator_name,status:row.status,guidelinesVersion:row.guidelines_version,developmentSample:row.development_sample,membership:row.membership??'NOT_JOINED',rules:row.rules,topics:row.topics,anonymousAllowed:row.anonymous_allowed,hostedByMe,reviewNote:hostedByMe?row.review_note:null,permissions:{join:row.status==='ACTIVE'&&!['BANNED','RESTRICTED','JOINED'].includes(row.membership),read:row.status==='ACTIVE'&&!shut,post:joined&&row.posting_enabled,comment:joined&&row.commenting_enabled,anonymous:joined&&row.anonymous_allowed}};
 }
 async function space(tx:Transaction,userId:string,id:string,locale='id-ID'):Promise<schema.Space>{
  const row=(await tx.query(`${spaceSql} AND s.id=$3`,[userId,locale,id])).rows[0];
  if(!row)throw fail('NOT_FOUND',404);
  return projectSpace(row);
 }
 function requirePermission(s:schema.Space,permission:'read'|'post'|'comment'){
  if(s.status!=='ACTIVE')throw fail('SPACE_RESTRICTED');
  if(!s.permissions.read)throw fail('MEMBERSHIP_REQUIRED');
  if(permission!=='read'&&s.membership!=='JOINED')throw fail('MEMBERSHIP_REQUIRED');
  if(!s.permissions[permission])throw fail(permission==='post'?'POSTING_DISABLED':'COMMENTING_DISABLED');
 }
 // Self-harm language is never published; the client shows crisis resources instead.
 function screen(result:SafetyResult){
  if(result.reasons.includes('SELF_HARM_LANGUAGE'))throw new ApiError(422,'SELF_HARM_SUPPORT','Tulisan ini tidak dipublikasikan. Kalau kamu sedang dalam bahaya, hubungi 119 ext. 8 atau Healing119.id.');
  if(['BLOCK','REQUIRE_EDIT'].includes(result.requiredAction))throw fail('CONTENT_REQUIRES_EDIT',422);
 }
 const id=(req:FastifyRequest,name='id')=>schema.uuid.parse((req.params as Record<string,string>)[name]);
 async function post(tx:Transaction,userId:string,postId:string){
  const p=(await tx.query(`SELECT p.* FROM space_posts p WHERE p.id=$2 AND ${blockedSql}`,[userId,postId])).rows[0];
  if(!p||p.status!=='VISIBLE')throw fail('CONTENT_REMOVED',404);
  const s=await space(tx,userId,p.space_id);requirePermission(s,'read');return {p,s};
 }
 // Projects many posts with three queries in total, whatever the number of posts.
 /* eslint-disable @typescript-eslint/no-explicit-any -- database rows */
 async function projectPosts(tx:Transaction,userId:string,posts:Record<string,any>[],locale='id-ID'):Promise<schema.SpacePost[]>{
  if(!posts.length)return [];
  const ids=posts.map(p=>p.id as string);
  const authors=[...new Set(posts.filter(p=>p.identity_mode==='PROFILE').map(p=>p.author_user_id as string))];
  const [names,reactions,translations,comments]=await Promise.all([
   authors.length?tx.query('SELECT user_id,display_name FROM member_profiles WHERE user_id=ANY($1)',[authors]):Promise.resolve({rows:[]}),
   tx.query('SELECT post_id,type FROM space_reactions WHERE post_id=ANY($1) AND user_id=$2',[ids,userId]),
   locale!=='id-ID'&&posts.some(p=>p.identity_mode==='ANNOUNCEMENT')?tx.query('SELECT post_id,body FROM space_post_translations WHERE post_id=ANY($1) AND locale=$2',[ids,locale]):Promise.resolve({rows:[]}),
   tx.query(`SELECT post_id,count(*)::int AS n FROM space_comments p WHERE post_id=ANY($2) AND status='VISIBLE' AND ${blockedSql} GROUP BY post_id`,[userId,ids])
  ]);
  const commentsOf=new Map(comments.rows.map((r:any)=>[r.post_id,r.n as number]));
  const nameOf=new Map(names.rows.map((r:any)=>[r.user_id,r.display_name])),bodyOf=new Map(translations.rows.map((r:any)=>[r.post_id,r.body]));
  return posts.map(p=>({id:p.id,body:bodyOf.get(p.id)??p.body,identityMode:p.identity_mode,status:p.status==='PENDING_REVIEW'?'PENDING_REVIEW':'VISIBLE',authorName:p.identity_mode==='ANONYMOUS'?'Anonymous Member':p.identity_mode==='ANNOUNCEMENT'?'Sandar Team':nameOf.get(p.author_user_id)??'Member',createdAt:(p.created_at as Date).toISOString(),own:p.author_user_id===userId,canBlock:Boolean(p.author_user_id&&p.author_user_id!==userId),commentCount:commentsOf.get(p.id)??0,reactions:(['SUPPORT','RELATE','ENCOURAGEMENT'] as const).map(type=>({type,selected:reactions.rows.some((r:any)=>r.post_id===p.id&&r.type===type)}))}));
 }
 const projectPost=async(tx:Transaction,userId:string,p:Record<string,any>,locale='id-ID')=>(await projectPosts(tx,userId,[p],locale))[0]!;
 /* eslint-enable @typescript-eslint/no-explicit-any */
 app.get('/v1/spaces',req=>run(req,async(tx,userId)=>{
  return (await tx.query(`${spaceSql} AND s.status IN ('ACTIVE','RESTRICTED') ORDER BY (s.kind='OFFICIAL_SANDAR') DESC,s.created_at,s.id LIMIT 50`,[userId,contentLocale(req)])).rows.map(projectSpace);
 }));
 app.get('/v1/spaces/:id',req=>run(req,(tx,userId)=>space(tx,userId,id(req),contentLocale(req))));
 app.post('/v1/spaces/:id/join',req=>run(req,async(tx,userId)=>{
  const v=schema.joinSpace.parse(req.body),s=await space(tx,userId,id(req));
  if(s.status!=='ACTIVE'||['BANNED','RESTRICTED'].includes(s.membership))throw fail('SPACE_RESTRICTED');
  if(v.guidelinesVersion!==s.guidelinesVersion)throw fail('GUIDELINES_CHANGED',409);
  if(s.membership!=='JOINED'){
   await tx.query(`INSERT INTO space_memberships(space_id,user_id,status,guidelines_version) VALUES($1,$2,'JOINED',$3) ON CONFLICT(space_id,user_id) DO UPDATE SET status='JOINED',guidelines_version=$3,joined_at=now(),left_at=NULL,updated_at=now()`,[s.id,userId,v.guidelinesVersion]);
   await event(tx,'official_space_join_completed',s.id);
  }
  return space(tx,userId,s.id,contentLocale(req));
 }));
 app.post('/v1/spaces/:id/leave',req=>run(req,async(tx,userId)=>{
  const s=await space(tx,userId,id(req));
  if(s.membership==='JOINED'){
   await tx.query("UPDATE space_memberships SET status='LEFT',left_at=now(),updated_at=now() WHERE space_id=$1 AND user_id=$2",[s.id,userId]);await event(tx,'official_space_left',s.id);
  }
  return space(tx,userId,s.id,contentLocale(req));
 }));
 app.get('/v1/spaces/:id/posts',req=>run(req,async(tx,userId)=>{
  const s=await space(tx,userId,id(req));requirePermission(s,'read');
  // Authors also see their own posts while they wait for review; nobody else does.
  const rows=(await tx.query(`SELECT p.* FROM space_posts p WHERE p.space_id=$2 AND (p.status='VISIBLE' OR (p.status='PENDING_REVIEW' AND p.author_user_id=$1)) AND ${blockedSql} ORDER BY (p.identity_mode='ANNOUNCEMENT') DESC,p.created_at DESC LIMIT 50`,[userId,s.id])).rows;
  return projectPosts(tx,userId,rows,contentLocale(req));
 }));
 app.get('/v1/space-posts/:id',req=>run(req,async(tx,userId)=>projectPost(tx,userId,(await post(tx,userId,id(req))).p,contentLocale(req))));
 app.post('/v1/spaces/:id/posts',req=>run(req,async(tx,userId)=>{
  const v=schema.postInput.parse(req.body),s=await space(tx,userId,id(req));requirePermission(s,'post');
  const profile=(await tx.query('SELECT allow_anonymous_posting FROM member_profiles WHERE user_id=$1',[userId])).rows[0];
  if(v.identityMode==='ANONYMOUS'&&(!s.permissions.anonymous||!profile?.allow_anonymous_posting))throw fail('ANONYMOUS_DISABLED');
  const existing=(await tx.query('SELECT * FROM space_posts WHERE author_user_id=$1 AND request_id=$2',[userId,v.requestId])).rows[0];
  if(existing){if(existing.space_id!==s.id||existing.body!==v.body||existing.identity_mode!==v.identityMode)throw fail('DUPLICATE_REQUEST_CONFLICT',409);return {postId:existing.id,status:existing.status};}
  const result=await safety.classify(v.body);
  screen(result);
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
  if(added.rowCount)await event(tx,'support_reaction_added',s.id);return projectPost(tx,userId,p,contentLocale(req));
 }));
 app.delete('/v1/space-posts/:id/reactions/:type',req=>run(req,async(tx,userId)=>{
  const v=schema.reactionInput.parse({type:(req.params as Record<string,string>).type}),{p}=await post(tx,userId,id(req));
  await tx.query('DELETE FROM space_reactions WHERE post_id=$1 AND user_id=$2 AND type=$3',[p.id,userId,v.type]);
  return projectPost(tx,userId,p,contentLocale(req));
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
  const result=await safety.classify(v.body);screen(result);
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
