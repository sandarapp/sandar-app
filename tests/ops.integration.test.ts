import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
import {codeAt,currentStep} from '../apps/api/src/ops/totp.js';
import {hostAllows} from '../packages/contracts/src/web-member.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_ops_test')throw new Error('Use isolated localhost/sandar_ops_test');
const db=new Pool({connectionString:url});
const app=await buildApp({db,email:{send:async()=>{}},encryptionKey:'a'.repeat(64)});
type Who={id:string;key:string};
let boss:Who,mod:Who,admin:Who,member1:Who,member2:Who,spaceId:string;
const call=(method:'GET'|'POST',path:string,who:{key:string},body?:unknown)=>app.inject({method,url:'/v1'+path,headers:{authorization:'Bearer '+who.key},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
async function person(email:string,name:string,role?:string):Promise<Who>{
 const id=randomUUID(),key=newToken();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,'unused','MEMBER','ACTIVE',now())",[id,email]);
 await db.query('INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at) VALUES($1,$2,now())',[id,name]);
 await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at,ops_verified_at,ops_seen_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day',now(),now())",[randomUUID(),id,digest(key)]);
 if(role)await db.query('INSERT INTO staff_roles(user_id,role) VALUES($1,$2)',[id,role]);
 return {id,key};
}
const join=(who:Who)=>call('POST',`/spaces/${spaceId}/join`,who,{accepted:true,guidelinesVersion:'test-v1'});
const post=async(who:Who,identityMode='PROFILE')=>(await call('POST',`/spaces/${spaceId}/posts`,who,{requestId:randomUUID(),identityMode,body:'Reported words here.'})).json().data.postId as string;
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 await db.query('TRUNCATE ops_audit,users,support_spaces,rate_limits,staff_2fa CASCADE').catch(async()=>{await db.query('ALTER TABLE ops_audit DISABLE TRIGGER USER');await db.query('TRUNCATE ops_audit,users,support_spaces,rate_limits,staff_2fa CASCADE');await db.query('ALTER TABLE ops_audit ENABLE TRIGGER USER');});
 boss=await person('boss@example.invalid','Boss','SUPER_ADMIN');mod=await person('mod@example.invalid','Mod','MODERATOR');admin=await person('admin@example.invalid','Admin','ADMIN');
 member1=await person('member1@example.invalid','Rani');member2=await person('member2@example.invalid','Budi');spaceId=randomUUID();
 await db.query("INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled,commenting_enabled) VALUES($1,'OFFICIAL_SANDAR','Work Stress','Peer support','Adults','Work','Sandar','ACTIVE','test-v1',true,true)",[spaceId]);
 await join(member1);await join(member2);
});
afterAll(async()=>{await app.close();await db.end();});
describe('Ops subdomain',()=>{
 it('keeps staff routes off the member host, and member routes off the Ops host',()=>{
  expect(hostAllows('web/member/ops/reports','app')).toBe(false);
  expect(hostAllows('web/member/moderation/queue','app')).toBe(false);
  expect(hostAllows('web/member/spaces','app')).toBe(true);
  expect(hostAllows('web/member/ops/reports','ops')).toBe(true);
  expect(hostAllows('web/auth/login','ops')).toBe(true);
  expect(hostAllows('web/member/spaces','ops')).toBe(false);
  expect(hostAllows('auth/register/member','ops')).toBe(false);
  expect(hostAllows('web/member/ops/reports','single')).toBe(true);
 });
});
describe('Second factor',()=>{
 it('enrols with a code, and blocks staff work until then',async()=>{
  await db.query('UPDATE sessions SET ops_verified_at=NULL,ops_seen_at=NULL WHERE user_id=$1',[mod.id]);
  expect((await call('GET','/ops/me',mod)).json().data.twoFactor).toBe('SETUP');
  expect((await call('GET','/ops/reports',mod)).json().error.code).toBe('OPS_2FA_REQUIRED');
  expect((await call('GET','/moderation/queue',mod)).json().error.code).toBe('OPS_2FA_REQUIRED');
  const {secret}=(await call('POST','/ops/2fa/setup',mod,{})).json().data;
  // Reloading the page must not replace a key already added to the app.
  expect((await call('POST','/ops/2fa/setup',mod,{})).json().data.secret).toBe(secret);
  expect((await db.query('SELECT secret_sealed FROM staff_2fa')).rows[0].secret_sealed).not.toContain(secret);
  expect((await call('POST','/ops/2fa/verify',mod,{code:'000000'})).json().error.code).toBe('OPS_2FA_WRONG');
  const code=codeAt(secret,currentStep());
  expect((await call('POST','/ops/2fa/verify',mod,{code})).statusCode).toBe(200);
  expect((await call('GET','/ops/me',mod)).json().data.twoFactor).toBe('OK');
  expect((await call('GET','/ops/reports',mod)).statusCode).toBe(200);
  expect((await call('POST','/ops/2fa/setup',mod,{})).statusCode).toBe(409);
  // The same code can't be replayed on a later sign-in.
  await db.query('UPDATE sessions SET ops_verified_at=NULL WHERE user_id=$1',[mod.id]);
  expect((await call('POST','/ops/2fa/verify',mod,{code})).json().error.code).toBe('OPS_2FA_WRONG');
 });
 it('locks after five wrong codes and expires after idle time',async()=>{
  await call('POST','/ops/2fa/setup',admin,{}).catch(()=>{});
  for(let i=0;i<5;i++)await call('POST','/ops/2fa/verify',admin,{code:'000000'});
  expect((await call('POST','/ops/2fa/verify',admin,{code:'000000'})).statusCode).toBe(429);
  await db.query("UPDATE sessions SET ops_seen_at=now()-interval '31 minutes' WHERE user_id=$1",[mod.id]);
  expect((await call('GET','/ops/reports',mod)).json().error.code).toBe('OPS_2FA_REQUIRED');
 });
 it('keeps out members and expired grants',async()=>{
  expect((await call('GET','/ops/me',member1)).statusCode).toBe(403);
  expect((await call('GET','/ops/dashboard',member1)).statusCode).toBe(403);
  await db.query("UPDATE staff_roles SET expires_at=now()-interval '1 day' WHERE user_id=$1",[mod.id]);
  expect((await call('GET','/ops/dashboard',mod)).statusCode).toBe(403);
 });
});
describe('Role limits',()=>{
 it.each([['/ops/reports','admin'],['/ops/feedback','mod'],['/ops/staff','admin'],['/ops/audit','mod']])('%s refuses %s',async(path,who)=>{
  expect((await call('GET',path,who==='mod'?mod:admin)).statusCode).toBe(403);
 });
 it('shows moderators only their counts',async()=>{
  const d=(await call('GET','/ops/dashboard',mod)).json().data;
  expect(d.reports).toBe(0);expect(d.members).toBeNull();
  expect((await call('GET','/ops/dashboard',admin)).json().data.members).toBe(5);
 });
});
describe('Reports',()=>{
 it('groups reports on a comment, which moderators can now see and remove',async()=>{
  const p=await post(member1);
  const c=(await call('POST',`/space-posts/${p}/comments`,member1,{requestId:randomUUID(),body:'A reported comment.'})).json().data.commentId;
  await call('POST',`/space-comments/${c}/report`,member2,{reason:'HARASSMENT'});
  await call('POST',`/space-comments/${c}/report`,mod,{reason:'PRIVACY'}).catch(()=>{});
  const list=(await call('GET','/ops/reports',mod)).json().data;
  expect(list[0]).toMatchObject({type:'COMMENT',id:c,severity:'HIGH',author:'Rani'});
  expect((await call('POST','/ops/reports/decision',mod,{outcome:'REMOVE',type:'COMMENT',id:c})).statusCode).toBe(400);
  expect((await call('POST','/ops/reports/decision',mod,{outcome:'REMOVE',type:'COMMENT',id:c,rule:'RULE_1'})).statusCode).toBe(200);
  expect((await db.query('SELECT status FROM space_comments WHERE id=$1',[c])).rows[0].status).toBe('REMOVED');
  expect((await call('GET','/ops/reports',mod)).json().data).toEqual([]);
  expect((await call('GET','/ops/audit',boss)).json().data[0]).toMatchObject({action:'REMOVE_CONTENT',targetId:c,reason:'RULE_1',actor:'Mod'});
 });
 it('never names the author of an anonymous post, and can dismiss',async()=>{
  const p=await post(member1,'ANONYMOUS');
  await call('POST',`/space-posts/${p}/report`,member2,{reason:'OTHER'});
  const r=await call('GET','/ops/reports',mod);
  expect(r.json().data[0]).toMatchObject({type:'POST',author:null,severity:'LOW'});
  expect(r.body).not.toContain('Rani');expect(r.body).not.toContain(member1.id);
  expect((await call('POST','/ops/reports/decision',mod,{outcome:'DISMISS',type:'POST',id:p})).statusCode).toBe(200);
  expect((await call('POST','/ops/reports/decision',mod,{outcome:'DISMISS',type:'POST',id:p})).statusCode).toBe(409);
 });
});
describe('Members',()=>{
 it('looks up one account, masks email, logs it, and leaves out anonymous posts and mood',async()=>{
  await post(member1,'ANONYMOUS');await call('POST','/mood',member1,{mood:'LOW'});
  const r=await call('POST','/ops/members/lookup',admin,{email:'member1@example.invalid',reason:'Checking a report.'});
  expect(r.json().data).toMatchObject({id:member1.id,email:'m•••@example.invalid',namedPosts:0,displayName:'Rani'});
  expect(r.body).not.toMatch(/mood|LOW|member1@/);
  expect((await call('POST','/ops/members/lookup',admin,{email:'member1@example.invalid'})).statusCode).toBe(400);
  expect((await call('POST','/ops/members/lookup',mod,{email:'member1@example.invalid',reason:'Checking a report.'})).statusCode).toBe(403);
  expect((await call('POST','/ops/members/lookup',mod,{id:member1.id})).statusCode).toBe(200);
  expect((await call('GET','/ops/audit',boss)).json().data.filter((a:{action:string})=>a.action==='MEMBER_LOOKUP')).toHaveLength(2);
 });
 it('suspends with a reason, ends sessions, and can restore',async()=>{
  expect((await call('POST',`/ops/members/${member1.id}/suspend`,admin,{})).statusCode).toBe(400);
  expect((await call('POST',`/ops/members/${member1.id}/suspend`,mod,{reason:'Repeated harassment.'})).statusCode).toBe(403);
  expect((await call('POST',`/ops/members/${member1.id}/suspend`,admin,{reason:'Repeated harassment.'})).statusCode).toBe(200);
  expect((await call('GET','/spaces',member1)).statusCode).toBe(401);
  expect((await call('POST',`/ops/members/${mod.id}/suspend`,admin,{reason:'Cannot be staff.'})).statusCode).toBe(409);
  expect((await call('POST',`/ops/members/${member1.id}/restore`,admin,{reason:'Appeal accepted.'})).statusCode).toBe(200);
 });
});
describe('Feedback',()=>{
 it('shows an email only if the member allowed contact',async()=>{
  await call('POST','/feedback',member1,{kind:'IDEA',body:'One idea.',contactOk:true});
  await call('POST','/feedback',member2,{kind:'BROKEN',body:'Something broke.'});
  await call('POST','/feedback',member2,{kind:'HELPFUL'});
  const list=(await call('GET','/ops/feedback',admin)).json().data;
  expect(list).toHaveLength(2);
  expect(list.find((f:{kind:string})=>f.kind==='IDEA').contactEmail).toBe('member1@example.invalid');
  expect(list.find((f:{kind:string})=>f.kind==='BROKEN').contactEmail).toBeNull();
  expect((await call('GET','/ops/dashboard',admin)).json().data).toMatchObject({feedback:2,helpful:{yes:1,no:0}});
  expect((await call('POST',`/ops/feedback/${list[0].id}/read`,admin,{})).statusCode).toBe(200);
 });
});
describe('Roles and audit',()=>{
 it('grants with an end date, and blocks self-change and losing the last super admin',async()=>{
  expect((await call('POST','/ops/staff/grant',boss,{email:'member1@example.invalid',role:'MODERATOR',reason:'Weekend cover.'})).statusCode).toBe(200);
  expect((await db.query('SELECT expires_at FROM staff_roles WHERE user_id=$1',[member1.id])).rows[0].expires_at).toBeTruthy();
  expect((await call('POST','/ops/staff/grant',boss,{email:'boss@example.invalid',role:'ADMIN',reason:'Give myself more.'})).json().error.code).toBe('OPS_NOT_YOURSELF');
  expect((await call('POST','/ops/staff/revoke',boss,{userId:boss.id,reason:'Remove myself.'})).json().error.code).toBe('OPS_NOT_YOURSELF');
  const other=await person('boss2@example.invalid','Boss Two','SUPER_ADMIN');
  expect((await call('POST','/ops/staff/revoke',other,{userId:boss.id,reason:'Leaving staff.'})).statusCode).toBe(200);
  expect((await call('POST','/ops/staff/revoke',other,{userId:other.id,reason:'Remove myself.'})).statusCode).toBe(409);
  expect((await call('GET','/ops/staff',boss)).statusCode).toBe(403);
 });
 it('removes all access at once and resets a lost authenticator',async()=>{
  expect((await call('POST',`/ops/staff/${mod.id}/reset-2fa`,boss,{reason:'Lost phone, identity checked.'})).statusCode).toBe(200);
  expect((await call('GET','/ops/reports',mod)).json().error.code).toBe('OPS_2FA_REQUIRED');
  expect((await call('POST','/ops/staff/revoke',boss,{userId:mod.id,reason:'Leaving staff.'})).statusCode).toBe(200);
  expect((await call('GET','/ops/me',mod)).statusCode).toBe(403);
 });
 it('keeps the log append-only',async()=>{
  await call('POST','/ops/staff/grant',boss,{email:'member1@example.invalid',role:'ADMIN',reason:'Admin cover.'});
  await expect(db.query('DELETE FROM ops_audit')).rejects.toThrow(/append-only/);
  await expect(db.query("UPDATE ops_audit SET action='X'")).rejects.toThrow(/append-only/);
 });
});
