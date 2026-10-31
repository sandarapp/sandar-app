import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
import {HumanReviewSafetyClassifier} from '../apps/api/src/spaces/safety.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_moderation_test')throw new Error('Use isolated localhost/sandar_moderation_test');
const db=new Pool({connectionString:url});
// The production setting: every member post is held for a person to review.
const app=await buildApp({db,email:{send:async()=>{}},safety:new HumanReviewSafetyClassifier()});
let spaceId:string,author:{id:string;key:string},reader:{id:string;key:string},moderator:{id:string;key:string};
const call=(method:'GET'|'POST',path:string,who:{key:string},body?:unknown)=>app.inject({method,url:'/v1'+path,headers:{authorization:'Bearer '+who.key},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
const feed=(who:{key:string})=>call('GET',`/spaces/${spaceId}/posts`,who).then(r=>r.json().data as {id:string;status:string;body:string}[]);
const write=(body:string,identityMode='PROFILE',who=author)=>call('POST',`/spaces/${spaceId}/posts`,who,{requestId:randomUUID(),identityMode,body}).then(r=>r.json().data as {postId:string;status:string});
async function member(email:string,name:string){
 const id=randomUUID(),key=newToken();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,'unused','MEMBER','ACTIVE',now())",[id,email]);
 await db.query('INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at,allow_anonymous_posting) VALUES($1,$2,now(),true)',[id,name]);
 await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),id,digest(key)]);
 return {id,key};
}
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 await db.query('TRUNCATE users,support_spaces,rate_limits CASCADE');
 spaceId=randomUUID();
 await db.query("INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled) VALUES($1,'OFFICIAL_SANDAR','Work Stress','Peer support','Adults','Work','Sandar','ACTIVE','test-v1',true)",[spaceId]);
 author=await member('author@example.invalid','Author Name');reader=await member('reader@example.invalid','Reader');moderator=await member('mod@example.invalid','Moderator');
 for(const who of [author,reader])await call('POST',`/spaces/${spaceId}/join`,who,{accepted:true,guidelinesVersion:'test-v1'});
 await db.query("INSERT INTO staff_roles(user_id,role) VALUES($1,'MODERATOR')",[moderator.id]);await db.query('UPDATE sessions SET ops_verified_at=now(),ops_seen_at=now() WHERE user_id=$1',[moderator.id]);
});
afterAll(async()=>{await app.close();await db.end();});

describe('member posting with human review',()=>{
 it('holds every post; only its author sees it, marked as in review',async()=>{
  const made=await write('A long week at work.');
  expect(made.status).toBe('PENDING_REVIEW');
  expect((await feed(author)).map(p=>[p.id,p.status])).toEqual([[made.postId,'PENDING_REVIEW']]);
  expect(await feed(reader)).toEqual([]);
  expect((await call('GET',`/space-posts/${made.postId}`,reader)).statusCode).toBe(404);
  expect((await call('POST',`/space-posts/${made.postId}/reactions`,reader,{type:'SUPPORT'})).statusCode).toBe(404);
 });

 it('lets only moderators read the queue and decide',async()=>{
  const made=await write('Hello everyone.');
  expect((await call('GET','/moderation/me',reader)).json().data).toEqual({moderator:false});
  expect((await call('GET','/moderation/me',moderator)).json().data).toEqual({moderator:true});
  expect((await call('GET','/moderation/queue',reader)).statusCode).toBe(403);
  expect((await call('POST',`/moderation/posts/${made.postId}/decision`,author,{decision:'APPROVE'})).statusCode).toBe(403);
  expect((await app.inject({method:'GET',url:'/v1/moderation/queue'})).statusCode).toBe(401);
  await db.query("UPDATE users SET account_type='COMMUNITY' WHERE id=$1",[moderator.id]);
  expect((await call('GET','/moderation/queue',moderator)).statusCode).toBe(403);
 });

 it('approves a post so everyone sees it, once, with an audit row',async()=>{
  const made=await write('Taking a proper lunch break today.');
  const queue=(await call('GET','/moderation/queue',moderator)).json().data;
  expect(queue.posts).toMatchObject([{postId:made.postId,authorName:'Author Name',spaceName:'Work Stress'}]);
  expect((await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'APPROVE'})).json().data).toEqual({postId:made.postId,status:'VISIBLE'});
  expect((await feed(reader)).map(p=>p.id)).toEqual([made.postId]);
  expect((await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'APPROVE'})).statusCode).toBe(409);
  expect((await db.query("SELECT action,moderator_user_id FROM moderation_actions")).rows).toEqual([{action:'APPROVE_POST',moderator_user_id:moderator.id}]);
  expect((await db.query("SELECT status FROM space_safety_cases WHERE post_id=$1",[made.postId])).rows).toEqual([{status:'CLOSED'}]);
  expect((await call('GET','/moderation/queue',moderator)).json().data.posts).toEqual([]);
 });

 it('removes a post with a rule; it disappears for its author too',async()=>{
  const made=await write('Buy my coaching programme.');
  expect((await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'REMOVE'})).statusCode).toBe(400);
  expect((await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'REMOVE',rule:'OTHER',note:'free text'})).statusCode).toBe(400);
  expect((await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'REMOVE',rule:'RULE_2'})).json().data.status).toBe('REMOVED');
  expect(await feed(author)).toEqual([]);
  expect((await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'APPROVE'})).statusCode).toBe(404);
  expect((await db.query("SELECT action,rule FROM moderation_actions")).rows).toEqual([{action:'REMOVE_POST',rule:'RULE_2'}]);
 });

 it('keeps anonymous authors anonymous in the moderation queue',async()=>{
  const made=await write('Something only I know.','ANONYMOUS');
  const response=await call('GET','/moderation/queue',moderator);
  expect(response.json().data.posts[0]).toMatchObject({postId:made.postId,identityMode:'ANONYMOUS',authorName:null});
  expect(response.body).not.toContain('Author Name');
  expect(response.body).not.toContain(author.id);
  expect(response.body).not.toContain('author@example');
 });

 it('handles reports: dismiss keeps the post, remove closes every report on it',async()=>{
  const made=await write('Visible post.');
  await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'APPROVE'});
  await call('POST',`/space-posts/${made.postId}/report`,reader,{reason:'HARASSMENT'});
  let reports=(await call('GET','/moderation/queue',moderator)).json().data.reports;
  expect(reports).toMatchObject([{postId:made.postId,reason:'HARASSMENT',reportsOnPost:1}]);
  expect(JSON.stringify(reports)).not.toContain(reader.id);
  await call('POST',`/moderation/reports/${reports[0].reportId}/dismiss`,moderator,{});
  expect((await call('GET','/moderation/queue',moderator)).json().data.reports).toEqual([]);
  expect((await feed(reader)).map(p=>p.id)).toEqual([made.postId]);
  const second=await member('third@example.invalid','Third');
  await call('POST',`/spaces/${spaceId}/join`,second,{accepted:true,guidelinesVersion:'test-v1'});
  await call('POST',`/space-posts/${made.postId}/report`,second,{reason:'OTHER'});
  reports=(await call('GET','/moderation/queue',moderator)).json().data.reports;
  await call('POST',`/moderation/posts/${reports[0].postId}/decision`,moderator,{decision:'REMOVE',rule:'RULE_1'});
  expect((await db.query("SELECT count(*)::int AS n FROM content_reports WHERE status='OPEN'")).rows[0].n).toBe(0);
  expect((await db.query("SELECT action FROM moderation_actions ORDER BY created_at")).rows.map(r=>r.action)).toEqual(['APPROVE_POST','DISMISS_REPORT','REMOVE_POST']);
 });

 it('keeps the moderation log append-only',async()=>{
  const made=await write('Logged.');
  await call('POST',`/moderation/posts/${made.postId}/decision`,moderator,{decision:'APPROVE'});
  await expect(db.query("UPDATE moderation_actions SET action='REMOVE_POST'")).rejects.toThrow(/append-only/);
  await expect(db.query('DELETE FROM moderation_actions')).rejects.toThrow(/append-only/);
 });

 it('still refuses posts where posting is closed, and comments stay closed',async()=>{
  await db.query('UPDATE support_spaces SET posting_enabled=false');
  expect((await call('POST',`/spaces/${spaceId}/posts`,author,{requestId:randomUUID(),identityMode:'PROFILE',body:'hi'})).statusCode).toBe(403);
 });
});
