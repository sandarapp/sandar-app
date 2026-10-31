import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
import {SelfHarmPhraseClassifier} from '../apps/api/src/spaces/safety.js';
import {SecretBox} from '../apps/api/src/core/encryption.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_member_extras_test')throw new Error('Use isolated localhost/sandar_member_extras_test');
const db=new Pool({connectionString:url});
const app=await buildApp({db,email:{send:async()=>{}},encryptionKey:'a'.repeat(64),safety:new SelfHarmPhraseClassifier()});
type Who={id:string;key:string};
let a:Who,b:Who,spaceId:string;
const call=(method:'GET'|'POST'|'PATCH'|'DELETE',path:string,who:{key:string},body?:unknown)=>app.inject({method,url:'/v1'+path,headers:{authorization:'Bearer '+who.key},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
async function member(email:string,name:string):Promise<Who>{
 const id=randomUUID(),key=newToken();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,'unused','MEMBER','ACTIVE',now())",[id,email]);
 await db.query('INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at) VALUES($1,$2,now())',[id,name]);
 await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),id,digest(key)]);
 return {id,key};
}
const join=(who:Who)=>call('POST',`/spaces/${spaceId}/join`,who,{accepted:true,guidelinesVersion:'test-v1'});
const post=async(who:Who,identityMode='PROFILE')=>(await call('POST',`/spaces/${spaceId}/posts`,who,{requestId:randomUUID(),identityMode,body:'A small thing that helped.'})).json().data.postId as string;
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 await db.query('TRUNCATE users,support_spaces,rate_limits CASCADE');
 a=await member('a@example.invalid','Ana');b=await member('b@example.invalid','Budi');spaceId=randomUUID();
 await db.query("INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled,commenting_enabled) VALUES($1,'OFFICIAL_SANDAR','Work Stress','Peer support','Adults','Work','Sandar','ACTIVE','test-v1',true,true)",[spaceId]);
});
afterAll(async()=>{await app.close();await db.end();});
describe('Mood check',()=>{
 it('saves one per day, can change, and stores nothing readable',async()=>{
  expect((await call('GET','/mood',a)).json().data).toMatchObject({enabled:true,today:null,lowDays:0});
  await call('POST','/mood',a,{mood:'LOW',words:['TIRED']});
  const r=await call('POST','/mood',a,{mood:'OKAY'});
  expect(r.json().data.today).toMatchObject({mood:'OKAY',words:[]});expect(r.json().data.week).toHaveLength(7);
  const rows=(await db.query('SELECT sealed FROM mood_checkins')).rows;
  expect(rows).toHaveLength(1);expect(rows[0].sealed).not.toMatch(/OKAY|LOW|TIRED/);
 });
 it('keeps each member private and rejects notes and unknown values',async()=>{
  await call('POST','/mood',a,{mood:'REALLY_HARD'});
  expect((await call('GET','/mood',b)).json().data.today).toBeNull();
  expect((await call('POST','/mood',a,{mood:'GOOD'})).statusCode).toBe(400);
  expect((await call('POST','/mood',a,{mood:'LOW',note:'private'})).statusCode).toBe(400);
  // A sealed row moved to another member can't be opened.
  await expect(db.query("UPDATE mood_checkins SET user_id=$1",[b.id])).resolves.toBeTruthy();
  expect((await call('GET','/mood',b)).statusCode).toBe(500);
 });
 it('notices five low days in a row, and a better day resets it',async()=>{
  const box=new SecretBox('a'.repeat(64));
  const day=async(ago:number)=>(await db.query("SELECT ((now() AT TIME ZONE 'Asia/Jakarta')::date-$1::int)::text AS d",[ago])).rows[0].d as string;
  for(const ago of [1,2,3,4]){const d=await day(ago);await db.query('INSERT INTO mood_checkins(user_id,day,sealed) VALUES($1,$2,$3)',[a.id,d,box.seal({mood:'LOW',words:[]},`mood:${a.id}:${d}`)]);}
  expect((await call('POST','/mood',a,{mood:'REALLY_HARD'})).json().data.lowDays).toBe(5);
  expect((await call('POST','/mood',a,{mood:'OKAY'})).json().data.lowDays).toBe(0);
 });
 it('exports, deletes, and turns off',async()=>{
  await call('POST','/mood',a,{mood:'GREAT',words:['CALM']});
  expect((await call('GET','/mood/export',a)).json().data[0]).toMatchObject({mood:'GREAT',words:['CALM']});
  expect((await call('DELETE','/mood',a)).json().data.today).toBeNull();
  expect((await db.query('SELECT 1 FROM mood_checkins')).rowCount).toBe(0);
  expect((await call('PATCH','/mood/settings',a,{enabled:false})).json().data.enabled).toBe(false);
 });
});
describe('Feedback and interest',()=>{
 it('stores feedback without asking for post content, and blocks self-harm text',async()=>{
  expect((await call('POST','/feedback',a,{kind:'IDEA',body:'Show quiet spaces.',page:'/discover'})).statusCode).toBe(200);
  expect((await call('POST','/feedback',a,{kind:'HELPFUL',moment:'discover-empty'})).statusCode).toBe(200);
  expect((await call('POST','/feedback',a,{kind:'IDEA'})).statusCode).toBe(400);
  expect((await call('POST','/feedback',a,{kind:'OTHER',body:'aku ingin bunuh diri'})).json().error.code).toBe('SELF_HARM_SUPPORT');
  expect((await db.query('SELECT 1 FROM member_feedback')).rowCount).toBe(2);
 });
 it('counts interest in events once per member',async()=>{
  expect((await call('GET','/interest/events',a)).json().data.interested).toBe(false);
  await call('POST','/interest/events',a,{});await call('POST','/interest/events',a,{});
  expect((await call('GET','/interest/events',a)).json().data.interested).toBe(true);
  expect((await db.query('SELECT 1 FROM event_interest')).rowCount).toBe(1);
 });
});
describe('Notifications, My spaces and Profile',()=>{
 it('tells a member about replies without the text, and respects blocks',async()=>{
  await join(a);await join(b);const p=await post(a);
  const c=await call('POST',`/space-posts/${p}/comments`,b,{requestId:randomUUID(),body:'Thanks, this helps.'});
  const list=await call('GET','/notifications',a);
  expect(list.json().data[0]).toMatchObject({kind:'REPLY',actor:'Budi',spaceName:'Work Stress',unread:true});
  expect(list.body).not.toContain('this helps');
  await call('POST','/notifications/seen',a,{});
  expect((await call('GET','/notifications',a)).json().data[0].unread).toBe(false);
  expect((await call('GET','/notifications',b)).json().data).toEqual([]);
  await call('POST',`/space-comments/${c.json().data.commentId}/block-author`,a,{});
  expect((await call('GET','/notifications',a)).json().data).toEqual([]);
 });
 it('lists joined spaces with their latest post',async()=>{
  expect((await call('GET','/spaces/mine',a)).json().data).toEqual([]);
  await join(a);await post(a);
  expect((await call('GET','/spaces/mine',a)).json().data[0]).toMatchObject({id:spaceId,joined:true,hosted:false});
  expect((await call('GET','/spaces/'+spaceId,a)).statusCode).toBe(200);
 });
 it('shows a member their own anonymous posts, and nobody else',async()=>{
  await join(a);await post(a,'ANONYMOUS');
  await call('PATCH','/me/profile',a,{bio:'Night owl.'});
  expect((await call('GET','/me/profile',a)).json().data).toMatchObject({displayName:'Ana',bio:'Night owl.',spaces:[{id:spaceId}],posts:[{identityMode:'ANONYMOUS'}]});
  expect((await call('GET','/me/profile',b)).json().data.posts).toEqual([]);
  expect((await call('PATCH','/me/profile',a,{bio:'x'.repeat(161)})).statusCode).toBe(400);
 });
});
