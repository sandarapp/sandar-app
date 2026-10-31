import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import {transaction} from '../../../../packages/database/src/database.js';
import {token} from '../../../../packages/contracts/src/auth.js';
import {uuid} from '../../../../packages/contracts/src/spaces.js';
import * as schema from '../../../../packages/contracts/src/moderation.js';
import type {AuthService} from '../auth/service.js';
import {authorize} from '../auth/authorization.js';
import {ApiError,invalidSession} from '../core/errors.js';
import {rateLimit} from '../core/rate-limit.js';
import {activeRoles,audit,requireOps} from '../ops/routes.js';

// Human review of member posts and reports. Only accounts with a MODERATOR
// staff role reach the queue; anonymous authors stay anonymous here too.
const gone=()=>new ApiError(404,'NOT_FOUND','Konten tidak ditemukan.');
async function isModerator(db:Pick<Transaction,'query'>,userId:string){
 return (await activeRoles(db,userId)).includes('MODERATOR');
}
async function event(tx:Transaction,name:string,spaceId:string){await tx.query('INSERT INTO space_analytics(id,event,space_id) VALUES($1,$2,$3)',[randomUUID(),name,spaceId]);}

export function addModeration(app:FastifyInstance,db:Database,auth:AuthService){
 async function user(request:FastifyRequest){
  const parsed=token.safeParse(request.headers.authorization?.replace(/^Bearer /,''));if(!parsed.success)throw invalidSession();
  const current=await auth.authenticate(parsed.data);authorize(current,'member:participate');return current;
 }
 async function run(request:FastifyRequest,work:(tx:Transaction,moderatorId:string)=>Promise<unknown>){
  const current=await requireOps(db,auth,request,['MODERATOR']);
  if(request.method!=='GET')await rateLimit(db,`moderation-write:${current.id}`,120,60);
  return transaction(db,async tx=>({data:await work(tx,current.id),error:null}));
 }
 const id=(req:FastifyRequest)=>uuid.parse((req.params as Record<string,string>).id);

 // Any member may ask; the answer only says whether to show the moderation link.
 app.get('/v1/moderation/me',async req=>{const current=await user(req);return {data:{moderator:await isModerator(db,current.id)},error:null};});

 app.get('/v1/moderation/queue',req=>run(req,async tx=>{
  const posts=(await tx.query(`SELECT p.id,p.space_id,s.name AS space_name,p.body,p.identity_mode,p.created_at,mp.display_name,
    EXISTS(SELECT 1 FROM space_safety_cases c WHERE c.post_id=p.id AND c.classification='HIGH_CONCERN') AS high_concern
   FROM space_posts p JOIN support_spaces s ON s.id=p.space_id LEFT JOIN member_profiles mp ON mp.user_id=p.author_user_id
   WHERE p.status='PENDING_REVIEW' ORDER BY high_concern DESC,p.created_at LIMIT 100`)).rows;
  const reports=(await tx.query(`SELECT r.id,r.reason,r.created_at,p.id AS post_id,p.body,s.name AS space_name,
    (SELECT count(*)::int FROM content_reports x WHERE x.post_id=p.id AND x.status='OPEN') AS reports_on_post
   FROM content_reports r JOIN space_posts p ON p.id=r.post_id JOIN support_spaces s ON s.id=p.space_id
   WHERE r.status='OPEN' AND p.status<>'REMOVED' ORDER BY r.created_at LIMIT 100`)).rows;
  const spaces=(await tx.query("SELECT id,name,purpose,topics,rules,anonymous_allowed,operator_name,updated_at FROM support_spaces WHERE status='IN_REVIEW' ORDER BY updated_at LIMIT 100")).rows;
  const queue:schema.ModerationQueue={
   spaces:spaces.map(s=>({spaceId:s.id,name:s.name,purpose:s.purpose,topics:s.topics??[],rules:s.rules??[],anonymousAllowed:s.anonymous_allowed,hostName:s.operator_name,createdAt:s.updated_at.toISOString()})),
   posts:posts.map(p=>({postId:p.id,spaceId:p.space_id,spaceName:p.space_name,body:p.body,identityMode:p.identity_mode,authorName:p.identity_mode==='ANONYMOUS'?null:p.display_name??null,createdAt:p.created_at.toISOString(),highConcern:p.high_concern})),
   reports:reports.map(r=>({reportId:r.id,reason:r.reason,createdAt:r.created_at.toISOString(),postId:r.post_id,postBody:r.body,spaceName:r.space_name,reportsOnPost:r.reports_on_post}))
  };
  return queue;
 }));

 app.post('/v1/moderation/posts/:id/decision',req=>run(req,async(tx,moderatorId)=>{
  const v=schema.postDecision.parse(req.body),postId=id(req);
  const p=(await tx.query('SELECT id,space_id,status,author_user_id FROM space_posts WHERE id=$1 FOR UPDATE',[postId])).rows[0];
  if(!p||!p.author_user_id||p.status==='REMOVED')throw gone();
  if(v.decision==='APPROVE'){
   if(p.status!=='PENDING_REVIEW')throw new ApiError(409,'ALREADY_REVIEWED','Postingan ini sudah ditinjau.');
   await tx.query("UPDATE space_posts SET status='VISIBLE',updated_at=now() WHERE id=$1",[postId]);
   await tx.query("UPDATE space_safety_cases SET status='CLOSED' WHERE post_id=$1",[postId]);
   await tx.query("INSERT INTO moderation_actions(id,moderator_user_id,action,post_id) VALUES($1,$2,'APPROVE_POST',$3)",[randomUUID(),moderatorId,postId]);
   await audit(tx,moderatorId,'APPROVE_POST','POST',postId);
  await event(tx,'post_approved',p.space_id);
   return {postId,status:'VISIBLE'};
  }
  await tx.query("UPDATE space_posts SET status='REMOVED',updated_at=now() WHERE id=$1",[postId]);
  await tx.query("UPDATE content_reports SET status='CLOSED' WHERE post_id=$1 AND status='OPEN'",[postId]);
  await tx.query("UPDATE space_safety_cases SET status='CLOSED' WHERE post_id=$1 OR report_id IN (SELECT id FROM content_reports WHERE post_id=$1)",[postId]);
  await tx.query("INSERT INTO moderation_actions(id,moderator_user_id,action,post_id,rule) VALUES($1,$2,'REMOVE_POST',$3,$4)",[randomUUID(),moderatorId,postId,v.rule]);
  await audit(tx,moderatorId,'REMOVE_CONTENT','POST',postId,v.rule);
  await event(tx,'post_removed',p.space_id);
  return {postId,status:'REMOVED'};
 }));

 app.post('/v1/moderation/spaces/:id/decision',req=>run(req,async(tx,moderatorId)=>{
  const v=schema.spaceDecision.parse(req.body),spaceId=id(req);
  const s=(await tx.query("SELECT status,host_user_id,guidelines_version FROM support_spaces WHERE id=$1 AND kind='MEMBER_SPACE' FOR UPDATE",[spaceId])).rows[0];
  if(!s)throw gone();
  if(s.status!=='IN_REVIEW')throw new ApiError(409,'ALREADY_REVIEWED','Ruang ini sudah ditinjau.');
  const outcome={APPROVE:['ACTIVE','APPROVE_SPACE'],CHANGES:['NEEDS_CHANGES','REQUEST_SPACE_CHANGES'],REJECT:['NOT_APPROVED','REJECT_SPACE']}[v.decision] as [string,string];
  await tx.query('UPDATE support_spaces SET status=$2,review_note=$3,updated_at=now() WHERE id=$1',[spaceId,outcome[0],v.decision==='APPROVE'?null:v.note]);
  // The host joins their own space the moment it opens.
  if(v.decision==='APPROVE')await tx.query("INSERT INTO space_memberships(space_id,user_id,status,guidelines_version) VALUES($1,$2,'JOINED',$3) ON CONFLICT(space_id,user_id) DO UPDATE SET status='JOINED',left_at=NULL,updated_at=now()",[spaceId,s.host_user_id,s.guidelines_version]);
  await tx.query('INSERT INTO moderation_actions(id,moderator_user_id,action,space_id) VALUES($1,$2,$3,$4)',[randomUUID(),moderatorId,outcome[1],spaceId]);
  await audit(tx,moderatorId,outcome[1],'SPACE',spaceId,v.decision==='APPROVE'?null:v.note);
  await auth.notifySpaceReviewed(tx,s.host_user_id);
  return {spaceId,status:outcome[0]};
 }));

 app.post('/v1/moderation/reports/:id/dismiss',req=>run(req,async(tx,moderatorId)=>{
  const reportId=id(req);
  const r=(await tx.query("SELECT id,status FROM content_reports WHERE id=$1 AND post_id IS NOT NULL FOR UPDATE",[reportId])).rows[0];
  if(!r)throw gone();
  if(r.status==='OPEN'){
   await tx.query("UPDATE content_reports SET status='CLOSED' WHERE id=$1",[reportId]);
   await tx.query("UPDATE space_safety_cases SET status='CLOSED' WHERE report_id=$1",[reportId]);
   await tx.query("INSERT INTO moderation_actions(id,moderator_user_id,action,report_id) VALUES($1,$2,'DISMISS_REPORT',$3)",[randomUUID(),moderatorId,reportId]);
  }
  return {reportId,status:'CLOSED'};
 }));
}
