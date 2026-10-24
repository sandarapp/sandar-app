import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_spaces_test')throw new Error('Use isolated localhost/sandar_spaces_test');
const db=new Pool({connectionString:url});
let safetyAction:'ALLOW'|'ESCALATE'|'REQUIRE_EDIT'='ALLOW';
const app=await buildApp({db,email:{send:async()=>{}},safety:{classify:async()=>({classification:safetyAction==='ESCALATE'?'HIGH_CONCERN':'SAFE',requiredAction:safetyAction,reasons:[],requiresHumanReview:safetyAction==='ESCALATE'})}});
let userId:string,otherId:string,spaceId:string,access:string,otherAccess:string;
const req=(path:string,body?:unknown,who=access)=>app.inject({method:body===undefined?'GET':'POST',url:'/v1'+path,headers:{authorization:'Bearer '+who},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
const join=(who=access)=>req('/spaces/'+spaceId+'/join',{accepted:true,guidelinesVersion:'test-v1'},who);
const create=(body='An ordinary stressful day.',identityMode='PROFILE',who=access,requestId=randomUUID())=>req('/spaces/'+spaceId+'/posts',{body,identityMode,requestId},who);
async function fixture(email:string,name:string){
 const id=randomUUID(),key=newToken();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,'unused','MEMBER','ACTIVE',now())",[id,email]);
 await db.query('INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at) VALUES($1,$2,now())',[id,name]);
 await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),id,digest(key)]);return {id,key};
}
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 safetyAction='ALLOW';
 await db.query('TRUNCATE users,support_spaces,rate_limits CASCADE');
 const a=await fixture('one@example.invalid','Private Display Name'),b=await fixture('two@example.invalid','Second member');userId=a.id;access=a.key;otherId=b.id;otherAccess=b.key;spaceId=randomUUID();
 // Posting is closed by default at launch; these tests cover the opened state.
 await db.query("INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled,commenting_enabled) VALUES($1,'OFFICIAL_SANDAR','Work Stress','Peer support','Adults','Work','Sandar','ACTIVE','test-v1',true,true)",[spaceId]);
});
afterAll(async()=>{await app.close();await db.end();});
describe('Official Sandar Spaces',()=>{
 it('loads only official spaces without fabricated counts; completed member is eligible',async()=>{const r=await req('/spaces');expect(r.statusCode).toBe(200);expect(r.json().data[0]).toMatchObject({label:'Official Sandar Space',membership:'NOT_JOINED',permissions:{read:false,join:true}});expect(JSON.stringify(r.json())).not.toMatch(/memberCount|rating|Verified Community/);});
 it('requires completed onboarding even if user status was ACTIVE',async()=>{await db.query('UPDATE member_profiles SET onboarding_completed_at=NULL WHERE user_id=$1',[userId]);expect((await req('/spaces')).statusCode).toBe(403);});
 it('rejects anonymous, expired, suspended, and Community requests',async()=>{expect((await app.inject('/v1/spaces')).statusCode).toBe(401);await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");expect((await req('/spaces')).statusCode).toBe(401);});
 it.each(['SUSPENDED','COMMUNITY'])('denies %s even with a formerly valid session',async v=>{await db.query(v==='COMMUNITY'?"UPDATE users SET account_type='COMMUNITY' WHERE id=$1":"UPDATE users SET status='SUSPENDED' WHERE id=$1",[userId]);expect([401,403]).toContain((await req('/spaces')).statusCode);});
 it('loads profile and validates unknown/malformed IDs',async()=>{expect((await req('/spaces/'+spaceId)).statusCode).toBe(200);expect((await req('/spaces/'+randomUUID())).statusCode).toBe(404);expect((await req('/spaces/wrong')).statusCode).toBe(400);});
 it('requires explicit current guidelines',async()=>{expect((await req('/spaces/'+spaceId+'/join',{accepted:false,guidelinesVersion:'test-v1'})).statusCode).toBe(400);expect((await req('/spaces/'+spaceId+'/join',{accepted:true,guidelinesVersion:'old'})).statusCode).toBe(409);});
 it('joins idempotently under concurrent submits and refreshes server permissions',async()=>{const rs=await Promise.all([join(),join()]);expect(rs.map(x=>x.statusCode)).toEqual([200,200]);expect((await db.query('SELECT * FROM space_memberships')).rowCount).toBe(1);expect((await req('/spaces/'+spaceId)).json().data).toMatchObject({membership:'JOINED',permissions:{read:true,post:true}});expect((await db.query("SELECT * FROM space_analytics WHERE event='official_space_join_completed'")).rowCount).toBe(1);});
 it('denies restricted space join and stale feed access',async()=>{await join();await db.query("UPDATE support_spaces SET status='RESTRICTED'");expect((await join()).statusCode).toBe(403);expect((await req('/spaces/'+spaceId+'/posts')).statusCode).toBe(403);});
 it.each(['BANNED','RESTRICTED'])('does not bypass %s membership',async status=>{await join();await db.query('UPDATE space_memberships SET status=$1',[status]);expect((await join()).statusCode).toBe(403);expect((await create()).statusCode).toBe(403);});
 it('supports leave/rejoin and prevents stale access while LEFT',async()=>{await join();expect((await req('/spaces/'+spaceId+'/leave',{})).json().data.membership).toBe('LEFT');expect((await req('/spaces/'+spaceId+'/posts')).statusCode).toBe(403);expect((await join()).json().data.membership).toBe('JOINED');});
 it('has empty feed and no unjoined access',async()=>{expect((await req('/spaces/'+spaceId+'/posts')).statusCode).toBe(403);await join();expect((await req('/spaces/'+spaceId+'/posts')).json().data).toEqual([]);});
 it('publishes named text and allows normal emotional language',async()=>{await join();const r=await create('I feel overwhelmed and anxious at work.');expect(r.statusCode).toBe(200);const feed=(await req('/spaces/'+spaceId+'/posts')).json().data;expect(feed[0]).toMatchObject({identityMode:'PROFILE',authorName:'Private Display Name'});});
 it('never exposes anonymous identity through normal feed/detail/reactions',async()=>{await join();await join(otherAccess);const made=(await create('I need a quiet day.','ANONYMOUS')).json().data;const results=[await req('/spaces/'+spaceId+'/posts',undefined,otherAccess),await req('/space-posts/'+made.postId,undefined,otherAccess),await req('/space-posts/'+made.postId+'/reactions',{type:'RELATE'},otherAccess)];for(const r of results){expect(r.statusCode).toBe(200);expect(r.body).not.toContain(userId);expect(r.body).not.toContain('Private Display Name');expect(r.body).not.toMatch(/authorUserId|author_user_id|one@example/);expect(r.body).toContain('Anonymous Member');}});
 it('rejects empty, extra image and identity injection fields',async()=>{await join();expect((await create('  ')).statusCode).toBe(400);expect((await req('/spaces/'+spaceId+'/posts',{requestId:randomUUID(),identityMode:'PROFILE',body:'hello',authorUserId:otherId,image:'x'})).statusCode).toBe(400);});
 it('deduplicates posts and rejects changed payload reuse',async()=>{await join();const key=randomUUID();const r=await Promise.all([create('same','PROFILE',access,key),create('same','PROFILE',access,key)]);expect(r[0].json().data.postId).toBe(r[1].json().data.postId);expect((await create('changed','PROFILE',access,key)).statusCode).toBe(409);expect((await db.query('SELECT * FROM space_posts')).rowCount).toBe(1);});
 it('enforces posting, commenting and anonymous settings',async()=>{await join();await db.query('UPDATE support_spaces SET anonymous_allowed=false');expect((await create('hello','ANONYMOUS')).statusCode).toBe(403);const p=(await create()).json().data.postId;await db.query('UPDATE support_spaces SET posting_enabled=false,commenting_enabled=false');expect((await create()).statusCode).toBe(403);expect((await req('/space-posts/'+p+'/comments',{requestId:randomUUID(),body:'support'})).statusCode).toBe(403);});
 it('allows only supportive reactions, idempotently',async()=>{await join();const p=(await create()).json().data.postId;expect((await req('/space-posts/'+p+'/reactions',{type:'LIKE'})).statusCode).toBe(400);await req('/space-posts/'+p+'/reactions',{type:'SUPPORT'});await req('/space-posts/'+p+'/reactions',{type:'SUPPORT'});expect((await db.query('SELECT * FROM space_reactions')).rowCount).toBe(1);});
 it('supports comments, deduplication, and report without exposing reporter',async()=>{await join();await join(otherAccess);const p=(await create()).json().data.postId,key=randomUUID();const c=await req('/space-posts/'+p+'/comments',{requestId:key,body:'Thanks for sharing.'},otherAccess);expect(c.statusCode).toBe(200);await req('/space-posts/'+p+'/comments',{requestId:key,body:'Thanks for sharing.'},otherAccess);expect((await db.query('SELECT * FROM space_comments')).rowCount).toBe(1);const report=await req('/space-comments/'+c.json().data.commentId+'/report',{reason:'OTHER'});expect(report.json().data).toEqual({submitted:true});expect(report.body).not.toContain(userId);expect((await db.query('SELECT * FROM space_safety_cases')).rowCount).toBe(1);});
 it('reports a post once, privately',async()=>{await join();const p=(await create()).json().data.postId;await req('/space-posts/'+p+'/report',{reason:'OTHER'});await req('/space-posts/'+p+'/report',{reason:'OTHER'});expect((await db.query('SELECT * FROM content_reports')).rowCount).toBe(1);});
 it('blocks anonymous authors without disclosing identity and prevents both-direction bypass',async()=>{await join();await join(otherAccess);const p=(await create('private','ANONYMOUS')).json().data.postId;const other=(await create('second','PROFILE',otherAccess)).json().data.postId;const block=await req('/space-posts/'+p+'/block-author',{},otherAccess);expect(block.json().data).toEqual({blocked:true});expect(block.body).not.toContain(userId);expect((await req('/spaces/'+spaceId+'/posts',undefined,otherAccess)).json().data.map((x:{id:string})=>x.id)).not.toContain(p);expect((await req('/space-posts/'+p,undefined,otherAccess)).statusCode).toBe(404);expect((await req('/space-posts/'+other+'/comments',{requestId:randomUUID(),body:'bypass'})).statusCode).toBe(404);});
 it('hides removed content on old links',async()=>{await join();const p=(await create()).json().data.postId;await db.query("UPDATE space_posts SET status='REMOVED'");expect((await req('/space-posts/'+p)).statusCode).toBe(404);});
 it('holds escalated content for review without diagnosing the member',async()=>{await join();safetyAction='ESCALATE';const r=await create();expect(r.json().data.status).toBe('PENDING_REVIEW');expect((await req('/spaces/'+spaceId+'/posts')).json().data).toEqual([]);expect((await db.query('SELECT classification FROM space_safety_cases')).rows[0].classification).toBe('HIGH_CONCERN');});
 it('requires edits when a configured safety adapter rejects content',async()=>{await join();safetyAction='REQUIRE_EDIT';expect((await create()).statusCode).toBe(422);expect((await db.query('SELECT * FROM space_posts')).rowCount).toBe(0);});
 it('records a failed join without sensitive analytics payloads',async()=>{await req('/spaces/'+spaceId+'/join',{accepted:true,guidelinesVersion:'stale'});expect((await db.query("SELECT * FROM space_analytics WHERE event='official_space_join_failed'")).rowCount).toBe(1);});
 it('rejects analytics text and stores only allowlisted events',async()=>{expect((await req('/spaces/analytics',{event:'official_spaces_viewed',body:'sensitive'})).statusCode).toBe(400);expect((await req('/spaces/analytics',{event:'official_spaces_viewed'})).statusCode).toBe(200);const row=(await db.query('SELECT * FROM space_analytics')).rows[0];expect(Object.keys(row).sort()).toEqual(['created_at','event','id','space_id']);});
});

describe('F04 canonical integration regressions',()=>{
 it('rejects an unverified member even with ACTIVE status and completed profile',async()=>{await db.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[userId]);for(const path of ['/spaces','/spaces/'+spaceId,'/spaces/'+spaceId+'/posts'])expect((await req(path)).statusCode).toBe(403);expect((await join()).statusCode).toBe(403);});
 it('F03 preferences cannot grant membership or bypass completion on direct routes',async()=>{await db.query("UPDATE member_profiles SET needs=ARRAY['BURNOUT'],goals=ARRAY['READ_QUIETLY'],community_type='MIXED',country='ID',city='Makassar',onboarding_completed_at=NULL WHERE user_id=$1",[userId]);for(const path of ['/spaces','/spaces/'+spaceId,'/spaces/'+spaceId+'/posts'])expect((await req(path)).statusCode).toBe(403);expect((await join()).statusCode).toBe(403);expect((await create()).statusCode).toBe(403);expect((await db.query('SELECT * FROM space_memberships WHERE user_id=$1',[userId])).rowCount).toBe(0);});
 it('completed preferences do not auto-join or allow posting before guidelines',async()=>{await db.query("UPDATE member_profiles SET needs=ARRAY['BURNOUT'],goals=ARRAY['READ_QUIETLY'],community_type='MIXED' WHERE user_id=$1",[userId]);expect((await req('/spaces/'+spaceId)).json().data.membership).toBe('NOT_JOINED');expect((await create()).statusCode).toBe(403);});
 it('rejects overlong post and invalid/empty comments',async()=>{await join();expect((await create('x'.repeat(1001))).statusCode).toBe(400);const p=(await create()).json().data.postId;expect((await req('/space-posts/'+p+'/comments',{requestId:randomUUID(),body:' '})).statusCode).toBe(400);expect((await req('/space-posts/'+randomUUID()+'/comments',{requestId:randomUUID(),body:'hello'})).statusCode).toBe(404);});
 it.each(['BANNED','RESTRICTED','SPACE_RESTRICTED'])('rechecks %s for reactions/comments/report/block',async status=>{await join();await join(otherAccess);const p=(await create('A shared experience','ANONYMOUS',otherAccess)).json().data.postId;if(status==='SPACE_RESTRICTED')await db.query("UPDATE support_spaces SET status='RESTRICTED' WHERE id=$1",[spaceId]);else await db.query('UPDATE space_memberships SET status=$1 WHERE user_id=$2',[status,userId]);for(const [suffix,body] of [['reactions',{type:'SUPPORT'}],['comments',{requestId:randomUUID(),body:'A reply'}],['report',{reason:'OTHER'}],['block-author',{}]] as const)expect((await req('/space-posts/'+p+'/'+suffix,body)).statusCode).toBe(403);});
 it('session expiry denies a join and subsequent writes',async()=>{await join(otherAccess);const p=(await create('A post','PROFILE',otherAccess)).json().data.postId;await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[userId]);expect((await join()).statusCode).toBe(401);expect((await create()).statusCode).toBe(401);expect((await req('/space-posts/'+p+'/comments',{requestId:randomUUID(),body:'reply'})).statusCode).toBe(401);});
 it('concurrent reaction adds retain one row',async()=>{await join();const p=(await create()).json().data.postId;const rs=await Promise.all([req('/space-posts/'+p+'/reactions',{type:'ENCOURAGEMENT'}),req('/space-posts/'+p+'/reactions',{type:'ENCOURAGEMENT'})]);expect(rs.map(r=>r.statusCode)).toEqual([200,200]);expect((await db.query('SELECT * FROM space_reactions')).rowCount).toBe(1);});
 it('anonymous parent comments do not expose parent identity and moderation stays private',async()=>{await join();await join(otherAccess);const p=(await create('private context','ANONYMOUS')).json().data.postId;await req('/space-posts/'+p+'/comments',{requestId:randomUUID(),body:'Thank you'},otherAccess);const replies=await req('/space-posts/'+p+'/comments',undefined,otherAccess);expect(replies.statusCode).toBe(200);expect(replies.body).not.toContain(userId);expect(replies.body).not.toContain('Private Display Name');for(const path of ['/admin/moderation','space-safety-cases','content-reports'])expect((await req(path.startsWith('/')?path:'/'+path)).statusCode).toBe(404);});
});

describe('F04 reaction removal',()=>{
 const remove=(postId:string,type='SUPPORT',who=access)=>app.inject({method:'DELETE',url:`/v1/space-posts/${postId}/reactions/${type}`,headers:{authorization:'Bearer '+who}});
 const count=async(postId:string)=>(await db.query('SELECT * FROM space_reactions WHERE post_id=$1',[postId])).rowCount;
 it('persists absent/add/remove/re-add and concurrent duplicate removals idempotently',async()=>{
  await join();const p=(await create()).json().data.postId;expect(await count(p)).toBe(0);
  const add=()=>req(`/space-posts/${p}/reactions`,{type:'SUPPORT'});
  expect((await Promise.all([add(),add()])).map(r=>r.statusCode)).toEqual([200,200]);expect(await count(p)).toBe(1);
  for(const r of await Promise.all([remove(p),remove(p)])){expect(r.statusCode).toBe(200);expect(r.json().data.reactions[0].selected).toBe(false);}expect(await count(p)).toBe(0);
  expect((await add()).json().data.reactions[0].selected).toBe(true);expect(await count(p)).toBe(1);
 });
 it('only removes the authenticated member reaction and preserves anonymous projection',async()=>{
  await join();await join(otherAccess);const p=(await create('Private experience','ANONYMOUS')).json().data.postId;
  for(const who of [access,otherAccess])await req(`/space-posts/${p}/reactions`,{type:'SUPPORT'},who);
  const r=await remove(p,'SUPPORT',otherAccess);expect(r.statusCode).toBe(200);expect(r.json().data).toMatchObject({authorName:'Anonymous Member',reactions:expect.arrayContaining([{type:'SUPPORT',selected:false}])});
  expect(r.body).not.toMatch(new RegExp(`${userId}|${otherId}|authorUserId|author_user_id|Private Display Name|one@example`));
  expect((await db.query('SELECT user_id FROM space_reactions WHERE post_id=$1',[p])).rows).toEqual([{user_id:userId}]);
 });
 it.each(['MISSING','LEFT','BANNED','RESTRICTED','SPACE_RESTRICTED','INCOMPLETE','UNVERIFIED','SUSPENDED','COMMUNITY','EXPIRED','UNAUTHENTICATED'])('denies removal for %s',async condition=>{
  await join();const p=(await create()).json().data.postId;await req(`/space-posts/${p}/reactions`,{type:'SUPPORT'});
  if(condition==='MISSING')await db.query('DELETE FROM space_memberships');
  if(['LEFT','BANNED','RESTRICTED'].includes(condition))await db.query('UPDATE space_memberships SET status=$1',[condition]);
  if(condition==='SPACE_RESTRICTED')await db.query("UPDATE support_spaces SET status='RESTRICTED'");
  if(condition==='INCOMPLETE')await db.query('UPDATE member_profiles SET onboarding_completed_at=NULL');
  if(condition==='UNVERIFIED')await db.query('UPDATE users SET email_verified_at=NULL');
  if(condition==='SUSPENDED')await db.query("UPDATE users SET status='SUSPENDED'");
  if(condition==='COMMUNITY')await db.query("UPDATE users SET account_type='COMMUNITY'");
  if(condition==='EXPIRED')await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
  expect([401,403]).toContain((await remove(p,'SUPPORT',condition==='UNAUTHENTICATED'?'':access)).statusCode);expect(await count(p)).toBe(1);
 });
 it('rejects invalid types, unknown/malformed and removed posts',async()=>{
  await join();const p=(await create()).json().data.postId;
  expect((await remove(p,'LIKE')).statusCode).toBe(400);expect((await remove('invalid')).statusCode).toBe(400);expect((await remove(randomUUID())).statusCode).toBe(404);
  await db.query("UPDATE space_posts SET status='REMOVED'");expect((await remove(p)).statusCode).toBe(404);
 });
 it.each([false,true])('preserves block filtering in both directions (reverse=%s)',async reverse=>{
  await join();await join(otherAccess);const p=(await create()).json().data.postId;await req(`/space-posts/${p}/reactions`,{type:'SUPPORT'},otherAccess);
  await db.query('INSERT INTO member_blocks(blocker_user_id,blocked_user_id) VALUES($1,$2)',reverse?[userId,otherId]:[otherId,userId]);
  expect((await remove(p,'SUPPORT',otherAccess)).statusCode).toBe(404);expect(await count(p)).toBe(1);
 });
});
