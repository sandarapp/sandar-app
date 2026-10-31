import {randomInt,randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import {transaction} from '../../../../packages/database/src/database.js';
import {token} from '../../../../packages/contracts/src/auth.js';
import {uuid} from '../../../../packages/contracts/src/spaces.js';
import * as schema from '../../../../packages/contracts/src/ops.js';
import type {AuthService} from '../auth/service.js';
import {authorize} from '../auth/authorization.js';
import {ApiError,invalidSession} from '../core/errors.js';
import {rateLimit} from '../core/rate-limit.js';
import {digest} from '../auth/crypto.js';

// Sandar Ops. Every request checks the role, its end date and a fresh second
// factor here; the menu only reflects this. Anonymous authors stay anonymous,
// and mood check-ins can't be reached from any of these routes.
const forbidden=()=>new ApiError(403,'FORBIDDEN','Anda tidak memiliki akses.');
const needFactor=()=>new ApiError(403,'OPS_2FA_REQUIRED','Masukkan kode autentikator.');
const gone=()=>new ApiError(404,'NOT_FOUND','Tidak ditemukan.');
const IDLE="interval '30 minutes'",TOTAL="interval '8 hours'";
const severityOf={HARMFUL_CONTENT:'HIGH',HARASSMENT:'HIGH',PRIVACY:'MEDIUM',MISINFORMATION:'MEDIUM',OTHER:'LOW'} as Record<string,schema.Severity>;
const rank={HIGH:0,MEDIUM:1,LOW:2};
export const maskEmail=(email:string)=>{const [name,domain]=email.split('@');return `${name![0]}•••@${domain}`;};
type Executor=Pick<Transaction,'query'>;

export async function activeRoles(db:Executor,userId:string){
 return (await db.query('SELECT role FROM staff_roles WHERE user_id=$1 AND (expires_at IS NULL OR expires_at>now())',[userId])).rows.map(r=>r.role as schema.StaffRole);
}
export async function audit(db:Executor,actor:string,action:string,targetType:string,targetId:string,reason?:string|null){
 await db.query('INSERT INTO ops_audit(id,actor_user_id,action,target_type,target_id,reason) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,action,targetType,targetId,reason??null]);
}
// The staff member behind a request, once role and second factor both check out.
export async function requireOps(db:Database,auth:AuthService,request:FastifyRequest,allowed:readonly schema.StaffRole[]){
 const parsed=token.safeParse(request.headers.authorization?.replace(/^Bearer /,''));if(!parsed.success)throw invalidSession();
 const user=await auth.authenticate(parsed.data);authorize(user,'member:participate');
 const roles=await activeRoles(db,user.id);
 if(!roles.some(r=>allowed.includes(r)))throw forbidden();
 const fresh=await db.query(`UPDATE sessions SET ops_seen_at=now() WHERE id=$1 AND ops_verified_at>now()-${TOTAL} AND ops_seen_at>now()-${IDLE} RETURNING id`,[user.session_id]);
 if(!fresh.rowCount)throw needFactor();
 return {id:user.id,roles};
}

export function addOps(app:FastifyInstance,db:Database,auth:AuthService){
 const ALL=schema.staffRoles,REVIEW=['MODERATOR'] as const,ADMINS=['ADMIN','SUPER_ADMIN'] as const,SUPER=['SUPER_ADMIN'] as const;
 const run=async<T>(req:FastifyRequest,roles:readonly schema.StaffRole[],work:(tx:Transaction,staff:{id:string;roles:schema.StaffRole[]})=>Promise<T>)=>{
  const staff=await requireOps(db,auth,req,roles);
  if(req.method!=='GET')await rateLimit(db,`ops-write:${staff.id}`,240,60);
  return {data:await transaction(db,tx=>work(tx,staff)),error:null};
 };
 async function signedIn(req:FastifyRequest){
  const parsed=token.safeParse(req.headers.authorization?.replace(/^Bearer /,''));if(!parsed.success)throw invalidSession();
  const user=await auth.authenticate(parsed.data);authorize(user,'member:participate');return user;
 }
 const idOf=(req:FastifyRequest)=>uuid.parse((req.params as Record<string,string>).id);

 app.get('/v1/ops/me',async req=>{
  const user=await signedIn(req),roles=await activeRoles(db,user.id);
  if(!roles.length)throw forbidden();
  const row=(await db.query(`SELECT mp.display_name,s.ops_verified_at>now()-${TOTAL} AND s.ops_seen_at>now()-${IDLE} AS fresh FROM sessions s LEFT JOIN member_profiles mp ON mp.user_id=s.user_id WHERE s.id=$1`,[user.session_id])).rows[0];
  const me:schema.OpsMe={roles,name:row?.display_name??'Staff',twoFactor:row?.fresh?'OK':'REQUIRED',email:maskEmail(user.email)};
  return {data:me,error:null};
 });
 // A new code replaces any earlier one, lasts 10 minutes and works once.
 app.post('/v1/ops/2fa/send',async req=>{
  const user=await signedIn(req);
  if(!(await activeRoles(db,user.id)).length)throw forbidden();
  await rateLimit(db,`ops-code-send:${user.id}`,5,900);
  const code=String(randomInt(0,1_000_000)).padStart(6,'0');
  await transaction(db,async tx=>{
   await tx.query(`INSERT INTO ops_email_codes(user_id,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(user_id) DO UPDATE SET code_hash=$2,expires_at=EXCLUDED.expires_at`,[user.id,digest(`${user.id}:${code}`)]);
   await auth.sendOpsCode(tx,user.email,code);
  });
  await auth.flushEmails();
  return {data:{sent:true},error:null};
 });
 app.post('/v1/ops/2fa/verify',async req=>{
  const user=await signedIn(req),v=schema.emailCode.parse(req.body);
  if(!(await activeRoles(db,user.id)).length)throw forbidden();
  await rateLimit(db,`ops-code:${user.id}`,5,900);
  await transaction(db,async tx=>{
   const used=await tx.query('DELETE FROM ops_email_codes WHERE user_id=$1 AND code_hash=$2 AND expires_at>now() RETURNING user_id',[user.id,digest(`${user.id}:${v.code}`)]);
   if(!used.rowCount)throw new ApiError(400,'OPS_CODE_WRONG','Kode tidak cocok atau sudah kedaluwarsa.');
   await tx.query('UPDATE sessions SET ops_verified_at=now(),ops_seen_at=now() WHERE id=$1',[user.session_id]);
   await audit(tx,user.id,'SIGN_IN','STAFF',user.id);
  });
  return {data:{verified:true},error:null};
 });

 // Counts only. Mood check-ins are sealed and aren't counted anywhere here.
 app.get('/v1/ops/dashboard',req=>run(req,ALL,async(tx,staff):Promise<schema.OpsDashboard>=>{
  const n=async(sql:string)=>(await tx.query(sql)).rows[0].n as number;
  const review=staff.roles.includes('MODERATOR'),admin=staff.roles.some(r=>(ADMINS as readonly string[]).includes(r));
  return {
   reports:review?await n("SELECT count(*)::int n FROM content_reports WHERE status='OPEN'"):0,
   spaces:review?await n("SELECT count(*)::int n FROM support_spaces WHERE status='IN_REVIEW'"):0,
   feedback:admin?await n("SELECT count(*)::int n FROM member_feedback WHERE status='NEW' AND kind NOT IN ('HELPFUL','NOT_HELPFUL')"):null,
   members:admin?await n("SELECT count(*)::int n FROM member_profiles WHERE onboarding_completed_at IS NOT NULL"):null,
   newMembers:admin?await n("SELECT count(*)::int n FROM users WHERE account_type='MEMBER' AND created_at>now()-interval '7 days'"):null,
   posts7d:admin?await n("SELECT count(*)::int n FROM space_posts WHERE created_at>now()-interval '7 days' AND author_user_id IS NOT NULL"):null,
   eventInterest:admin?await n('SELECT count(*)::int n FROM event_interest'):null,
   helpful:admin?{yes:await n("SELECT count(*)::int n FROM member_feedback WHERE kind='HELPFUL'"),no:await n("SELECT count(*)::int n FROM member_feedback WHERE kind='NOT_HELPFUL'")}:null
  };
 }));

 // One row per reported item, most serious first. An anonymous post has no author here.
 app.get('/v1/ops/reports',req=>run(req,REVIEW,async(tx):Promise<schema.OpsReport[]>=>{
  const rows=(await tx.query(`SELECT 'POST' AS type,p.id,p.body,s.name AS space_name,CASE WHEN p.identity_mode='PROFILE' THEN mp.display_name END AS author,array_agg(DISTINCT r.reason) AS reasons,count(*)::int AS n,min(r.created_at) AS at
    FROM content_reports r JOIN space_posts p ON p.id=r.post_id JOIN support_spaces s ON s.id=p.space_id LEFT JOIN member_profiles mp ON mp.user_id=p.author_user_id
    WHERE r.status='OPEN' AND p.status<>'REMOVED' GROUP BY p.id,s.name,mp.display_name
   UNION ALL SELECT 'COMMENT',c.id,c.body,s.name,mp.display_name,array_agg(DISTINCT r.reason),count(*)::int,min(r.created_at)
    FROM content_reports r JOIN space_comments c ON c.id=r.comment_id JOIN space_posts p ON p.id=c.post_id JOIN support_spaces s ON s.id=p.space_id LEFT JOIN member_profiles mp ON mp.user_id=c.author_user_id
    WHERE r.status='OPEN' AND c.status<>'REMOVED' GROUP BY c.id,s.name,mp.display_name LIMIT 200`)).rows;
  const worst=(reasons:string[])=>reasons.map(r=>severityOf[r]??'LOW').sort((a,b)=>rank[a]-rank[b])[0]!;
  return rows.map(r=>({type:r.type,id:r.id,body:r.body,spaceName:r.space_name,author:r.author,reasons:r.reasons,count:r.n,severity:worst(r.reasons),createdAt:r.at.toISOString()})).sort((a,b)=>rank[a.severity]-rank[b.severity]||a.createdAt.localeCompare(b.createdAt));
 }));
 app.post('/v1/ops/reports/decision',req=>run(req,REVIEW,async(tx,staff)=>{
  const v=schema.reportDecision.parse(req.body),post=v.type==='POST',table=post?'space_posts':'space_comments',field=post?'post_id':'comment_id';
  const item=(await tx.query(`SELECT id,status FROM ${table} WHERE id=$1 FOR UPDATE`,[v.id])).rows[0];
  if(!item||item.status==='REMOVED')throw gone();
  const reports=(await tx.query(`UPDATE content_reports SET status='CLOSED' WHERE ${field}=$1 AND status='OPEN' RETURNING id`,[v.id])).rows.map(r=>r.id as string);
  if(!reports.length)throw new ApiError(409,'ALREADY_REVIEWED','Laporan ini sudah ditinjau.');
  await tx.query(`UPDATE space_safety_cases SET status='CLOSED' WHERE report_id=ANY($1) OR ${field}=$2`,[reports,v.id]);
  if(v.outcome==='REMOVE'){
   await tx.query(`UPDATE ${table} SET status='REMOVED'${post?',updated_at=now()':''} WHERE id=$1`,[v.id]);
   await tx.query(`INSERT INTO moderation_actions(id,moderator_user_id,action,${field},rule) VALUES($1,$2,$3,$4,$5)`,[randomUUID(),staff.id,post?'REMOVE_POST':'REMOVE_COMMENT',v.id,v.rule]);
  }else await tx.query(`INSERT INTO moderation_actions(id,moderator_user_id,action,${field},report_id) VALUES($1,$2,'DISMISS_REPORT',$3,$4)`,[randomUUID(),staff.id,v.id,reports[0]]);
  await audit(tx,staff.id,v.outcome==='REMOVE'?'REMOVE_CONTENT':'DISMISS_REPORTS',v.type,v.id,v.outcome==='REMOVE'?v.rule:null);
  return {id:v.id,outcome:v.outcome};
 }));

 // No member directory: one exact lookup at a time. Moderators may use an ID only,
 // and an email lookup needs a reason. Every lookup is logged.
 app.post('/v1/ops/members/lookup',req=>run(req,ALL,async(tx,staff):Promise<schema.OpsMember>=>{
  const v=schema.memberLookup.parse(req.body),byEmail='email' in v;
  if(byEmail&&!staff.roles.some(r=>(ADMINS as readonly string[]).includes(r)))throw forbidden();
  const u=(await tx.query(`SELECT u.id,u.email,u.status,u.created_at,mp.display_name FROM users u LEFT JOIN member_profiles mp ON mp.user_id=u.id WHERE ${byEmail?'u.email=$1':'u.id=$1'} AND u.deleted_at IS NULL AND u.account_type='MEMBER'`,[byEmail?v.email:v.id])).rows[0];
  await audit(tx,staff.id,'MEMBER_LOOKUP','MEMBER',u?.id??'not-found',byEmail?v.reason:null);
  if(!u)throw gone();
  const c=(await tx.query(`SELECT (SELECT count(*)::int FROM space_memberships WHERE user_id=$1 AND status='JOINED') AS spaces,
    (SELECT count(*)::int FROM space_posts WHERE author_user_id=$1 AND identity_mode='PROFILE') AS posts,
    (SELECT count(*)::int FROM content_reports r JOIN space_posts p ON p.id=r.post_id WHERE p.author_user_id=$1 AND p.identity_mode='PROFILE') AS reports`,[u.id])).rows[0];
  return {id:u.id,email:maskEmail(u.email),status:u.status,joinedAt:u.created_at.toISOString(),displayName:u.display_name,spaces:c.spaces,namedPosts:c.posts,reportsOnNamedPosts:c.reports,roles:await activeRoles(tx,u.id)};
 }));
 app.post('/v1/ops/members/:id/suspend',req=>run(req,ADMINS,async(tx,staff)=>{
  const id=idOf(req),v=schema.reasonInput.parse(req.body);
  if(id===staff.id)throw new ApiError(409,'OPS_NOT_YOURSELF','Tidak bisa untuk akun sendiri.');
  if((await activeRoles(tx,id)).length)throw new ApiError(409,'OPS_STAFF_ACCOUNT','Cabut peran staf dulu.');
  const r=await tx.query("UPDATE users SET status='SUSPENDED' WHERE id=$1 AND account_type='MEMBER' AND deleted_at IS NULL RETURNING id",[id]);
  if(!r.rowCount)throw gone();
  await tx.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',[id]);
  await audit(tx,staff.id,'SUSPEND_MEMBER','MEMBER',id,v.reason);
  return {id,status:'SUSPENDED'};
 }));
 app.post('/v1/ops/members/:id/restore',req=>run(req,ADMINS,async(tx,staff)=>{
  const id=idOf(req),v=schema.reasonInput.parse(req.body);
  const r=await tx.query("UPDATE users SET status='ACTIVE' WHERE id=$1 AND status='SUSPENDED' RETURNING id",[id]);
  if(!r.rowCount)throw gone();
  await audit(tx,staff.id,'RESTORE_MEMBER','MEMBER',id,v.reason);
  return {id,status:'ACTIVE'};
 }));

 app.get('/v1/ops/feedback',req=>run(req,ADMINS,async(tx):Promise<schema.OpsFeedback[]>=>
  (await tx.query(`SELECT f.*,u.email FROM member_feedback f JOIN users u ON u.id=f.user_id WHERE f.body IS NOT NULL ORDER BY f.status='NEW' DESC,f.created_at DESC LIMIT 100`)).rows.map(f=>({id:f.id,kind:f.kind,page:f.page,moment:f.moment,body:f.body,device:f.device,status:f.status,contactEmail:f.contact_ok?f.email:null,createdAt:f.created_at.toISOString()}))));
 app.post('/v1/ops/feedback/:id/read',req=>run(req,ADMINS,async(tx,staff)=>{
  const id=idOf(req);
  const r=await tx.query("UPDATE member_feedback SET status='READ' WHERE id=$1 RETURNING id",[id]);if(!r.rowCount)throw gone();
  await audit(tx,staff.id,'READ_FEEDBACK','FEEDBACK',id);return {id};
 }));

 app.get('/v1/ops/staff',req=>run(req,SUPER,async(tx):Promise<schema.OpsStaff[]>=>{
  const rows=(await tx.query(`SELECT r.user_id,r.role,r.expires_at,u.email,mp.display_name FROM staff_roles r JOIN users u ON u.id=r.user_id LEFT JOIN member_profiles mp ON mp.user_id=r.user_id WHERE r.expires_at IS NULL OR r.expires_at>now() ORDER BY mp.display_name,r.role`)).rows;
  const staff=new Map<string,schema.OpsStaff>();
  for(const r of rows){
   const entry:schema.OpsStaff=staff.get(r.user_id)??{userId:r.user_id,name:r.display_name??'Staff',email:maskEmail(r.email),grants:[]};
   entry.grants.push({role:r.role,expiresAt:r.expires_at?.toISOString()??null});staff.set(r.user_id,entry);
  }
  return [...staff.values()];
 }));
 async function endOpsAccess(tx:Transaction,userId:string){await tx.query('UPDATE sessions SET ops_verified_at=NULL,ops_seen_at=NULL WHERE user_id=$1',[userId]);}
 async function keepSuper(tx:Transaction,leaving:string){
  const left=await tx.query("SELECT 1 FROM staff_roles WHERE role='SUPER_ADMIN' AND user_id<>$1 AND (expires_at IS NULL OR expires_at>now())",[leaving]);
  if(!left.rowCount)throw new ApiError(409,'OPS_LAST_SUPER','Harus ada setidaknya satu super admin.');
 }
 app.post('/v1/ops/staff/grant',req=>run(req,SUPER,async(tx,staff)=>{
  const v=schema.grantInput.parse(req.body);
  const u=(await tx.query("SELECT id FROM users WHERE email=$1 AND account_type='MEMBER' AND deleted_at IS NULL AND status='ACTIVE'",[v.email])).rows[0];
  if(!u)throw gone();
  if(u.id===staff.id)throw new ApiError(409,'OPS_NOT_YOURSELF','Tidak bisa untuk akun sendiri.');
  await tx.query("INSERT INTO staff_roles(user_id,role,expires_at,granted_by) VALUES($1,$2,COALESCE($3::timestamptz,now()+interval '1 year'),$4) ON CONFLICT(user_id,role) DO UPDATE SET expires_at=EXCLUDED.expires_at,granted_by=$4",[u.id,v.role,v.expiresAt??null,staff.id]);
  await audit(tx,staff.id,'GRANT_ROLE:'+v.role,'STAFF',u.id,v.reason);
  return {userId:u.id,role:v.role};
 }));
 // Without a role this removes one grant; without one it ends all access at once.
 app.post('/v1/ops/staff/revoke',req=>run(req,SUPER,async(tx,staff)=>{
  const v=schema.revokeInput.parse(req.body);
  if(v.userId===staff.id)throw new ApiError(409,'OPS_NOT_YOURSELF','Tidak bisa untuk akun sendiri.');
  const roles=await activeRoles(tx,v.userId);
  if((!v.role||v.role==='SUPER_ADMIN')&&roles.includes('SUPER_ADMIN'))await keepSuper(tx,v.userId);
  await tx.query(`DELETE FROM staff_roles WHERE user_id=$1${v.role?' AND role=$2':''}`,v.role?[v.userId,v.role]:[v.userId]);
  await endOpsAccess(tx,v.userId);
  await audit(tx,staff.id,v.role?'REVOKE_ROLE:'+v.role:'REMOVE_ALL_ACCESS','STAFF',v.userId,v.reason);
  return {userId:v.userId};
 }));
 app.get('/v1/ops/audit',req=>run(req,SUPER,async(tx):Promise<schema.OpsAuditEntry[]>=>
  (await tx.query('SELECT a.*,mp.display_name FROM ops_audit a LEFT JOIN member_profiles mp ON mp.user_id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 200')).rows.map(a=>({id:a.id,actor:a.display_name??'Staff',action:a.action,targetType:a.target_type,targetId:a.target_id,reason:a.reason,at:a.created_at.toISOString()}))));
}
