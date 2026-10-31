import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
import {SelfHarmPhraseClassifier} from '../apps/api/src/spaces/safety.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_member_spaces_test')throw new Error('Use isolated localhost/sandar_member_spaces_test');
const db=new Pool({connectionString:url});
const app=await buildApp({db,email:{send:async()=>{}},encryptionKey:'a'.repeat(64),safety:new SelfHarmPhraseClassifier()});
type Who={id:string;key:string};
let host:Who,other:Who,mod:Who;
const call=(method:'GET'|'POST'|'PATCH',path:string,who:{key:string},body?:unknown)=>app.inject({method,url:'/v1'+path,headers:{authorization:'Bearer '+who.key},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
async function member(email:string,name:string):Promise<Who>{
 const id=randomUUID(),key=newToken();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,'unused','MEMBER','ACTIVE',now())",[id,email]);
 await db.query('INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at) VALUES($1,$2,now())',[id,name]);
 await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),id,digest(key)]);
 return {id,key};
}
const input=(extra={})=>({requestId:randomUUID(),name:'Night Shift Workers',purpose:'A calm place for people working night shifts.',topics:['WORK_PRESSURE'],anonymousAllowed:true,rules:['Be kind. Listen before advising.'],pledge:true,...extra});
const send=(who:Who=host,extra={})=>call('POST','/member-spaces',who,input(extra));
const decide=(id:string,body:unknown,who:Who=mod)=>call('POST',`/moderation/spaces/${id}/decision`,who,body);
const listed=async(who:Who)=>(await call('GET','/spaces',who)).json().data.map((s:{id:string})=>s.id);
const found=async(who:Who)=>(await call('POST','/discovery/search',who,{})).json().data.results.map((r:{id:string})=>r.id);
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 await db.query('TRUNCATE users,support_spaces,rate_limits,email_outbox CASCADE');
 host=await member('host@example.invalid','Rani');other=await member('other@example.invalid','Budi');mod=await member('mod@example.invalid','Mod');
 await db.query("INSERT INTO staff_roles(user_id,role) VALUES($1,'MODERATOR')",[mod.id]);
});
afterAll(async()=>{await app.close();await db.end();});
describe('Spaces started by members',()=>{
 it('stays visible only to its host until approved',async()=>{
  const id=(await send()).json().data.id;
  for(const who of [host,other]){expect(await listed(who)).not.toContain(id);expect(await found(who)).not.toContain(id);}
  expect((await call('GET','/spaces/'+id,other)).statusCode).toBe(404);
  expect((await call('GET','/spaces/'+id,host)).json().data).toMatchObject({status:'IN_REVIEW',hostedByMe:true,permissions:{read:false,join:false,post:false}});
  expect((await call('GET','/member-spaces/mine',host)).json().data).toMatchObject([{id,status:'IN_REVIEW'}]);
 });
 it('opens on approval, with the host joined and members able to find and join it',async()=>{
  const id=(await send()).json().data.id;
  const queue=(await call('GET','/moderation/queue',mod)).json().data;
  expect(queue.spaces[0]).toMatchObject({spaceId:id,name:'Night Shift Workers',hostName:'Rani'});
  expect((await decide(id,{decision:'APPROVE'})).json().data.status).toBe('ACTIVE');
  expect((await call('GET','/spaces/'+id,host)).json().data).toMatchObject({membership:'JOINED',label:'Member space',permissions:{post:true}});
  expect(await listed(other)).toContain(id);expect(await found(other)).toContain(id);
  const seen=(await call('GET','/spaces/'+id,other)).json().data;
  expect(seen).toMatchObject({hostedByMe:false,reviewNote:null,rules:['Be kind. Listen before advising.'],permissions:{read:true,join:true}});
  expect((await call('POST',`/spaces/${id}/join`,other,{accepted:true,guidelinesVersion:seen.guidelinesVersion})).statusCode).toBe(200);
  expect((await db.query("SELECT 1 FROM moderation_actions WHERE action='APPROVE_SPACE' AND space_id=$1",[id])).rowCount).toBe(1);
  expect((await db.query('SELECT 1 FROM email_outbox')).rowCount).toBe(1);
 });
 it('never shows the host who wrote an anonymous post',async()=>{
  const id=(await send()).json().data.id;await decide(id,{decision:'APPROVE'});
  const seen=(await call('GET','/spaces/'+id,other)).json().data;
  await call('POST',`/spaces/${id}/join`,other,{accepted:true,guidelinesVersion:seen.guidelinesVersion});
  await call('POST',`/spaces/${id}/posts`,other,{requestId:randomUUID(),identityMode:'ANONYMOUS',body:'A quiet night.'});
  const feed=await call('GET',`/spaces/${id}/posts`,host);
  expect(feed.json().data[0].authorName).toBe('Anonymous Member');expect(feed.body).not.toContain('Budi');expect(feed.body).not.toContain(other.id);
 });
 it('sends a space back with a note the host alone sees, and can be sent again',async()=>{
  const id=(await send()).json().data.id;
  expect((await decide(id,{decision:'CHANGES',note:'Please drop the medical claim.'})).statusCode).toBe(200);
  expect((await call('GET','/spaces/'+id,host)).json().data).toMatchObject({status:'NEEDS_CHANGES',reviewNote:'Please drop the medical claim.'});
  expect((await call('GET','/spaces/'+id,other)).statusCode).toBe(404);
  expect((await call('PATCH','/member-spaces/'+id,other,input())).statusCode).toBe(404);
  expect((await call('PATCH','/member-spaces/'+id,host,input({name:'Night Shift Friends'}))).json().data.status).toBe('IN_REVIEW');
  expect((await call('PATCH','/member-spaces/'+id,host,input())).statusCode).toBe(409);
  expect((await decide(id,{decision:'APPROVE'})).statusCode).toBe(200);
  expect((await decide(id,{decision:'APPROVE'})).statusCode).toBe(409);
 });
 it('frees the name after a rejection and requires a reason',async()=>{
  const id=(await send()).json().data.id;
  expect((await decide(id,{decision:'REJECT'})).statusCode).toBe(400);
  await decide(id,{decision:'REJECT',note:'This overlaps with crisis care.'});
  expect((await call('GET','/spaces/'+id,other)).statusCode).toBe(404);
  expect((await send(other)).statusCode).toBe(200);
 });
 it('limits members to one in review and two hosted',async()=>{
  const first=(await send()).json().data.id;
  expect((await send(host,{name:'Second Space'})).json().error.code).toBe('SPACE_ALREADY_IN_REVIEW');
  await decide(first,{decision:'APPROVE'});
  await decide((await send(host,{name:'Second Space'})).json().data.id,{decision:'APPROVE'});
  expect((await send(host,{name:'Third Space'})).json().error.code).toBe('SPACE_LIMIT_REACHED');
 });
 it('sends a retried request once',async()=>{
  const requestId=randomUUID();const a=await send(host,{requestId}),b=await send(host,{requestId});
  expect(b.json().data.id).toBe(a.json().data.id);
  expect((await db.query('SELECT 1 FROM support_spaces')).rowCount).toBe(1);
 });
 it('rejects taken names, contact details, staff titles, missing pledge and self-harm text',async()=>{
  await send();
  expect((await send(other,{name:'night shift workers'})).json().error.code).toBe('SPACE_NAME_TAKEN');
  for(const name of ['Call me a@b.id','Sandar Official','www.mysite.com','Group 08123456789'])expect((await send(other,{name})).json().error.code,name).toBe('SPACE_NAME_NOT_ALLOWED');
  expect((await send(other,{name:'No Pledge',pledge:false})).statusCode).toBe(400);
  expect((await send(other,{name:'Hard Days',purpose:'Untuk yang ingin bunuh diri saat ini.'})).json().error.code).toBe('SELF_HARM_SUPPORT');
  expect((await db.query('SELECT 1 FROM support_spaces')).rowCount).toBe(1);
 });
 it('keeps review to moderators and setup-finished members',async()=>{
  const id=(await send()).json().data.id;
  expect((await decide(id,{decision:'APPROVE'},other)).statusCode).toBe(403);
  await db.query('UPDATE member_profiles SET onboarding_completed_at=NULL WHERE user_id=$1',[other.id]);
  expect((await send(other,{name:'Other Space'})).statusCode).toBe(403);
 });
});
