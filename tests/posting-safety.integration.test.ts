import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
import {SelfHarmPhraseClassifier} from '../apps/api/src/spaces/safety.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_posting_safety_test')throw new Error('Use isolated localhost/sandar_posting_safety_test');
const db=new Pool({connectionString:url});
// The production setting: posts and comments publish at once, self-harm language is held back.
const app=await buildApp({db,email:{send:async()=>{}},safety:new SelfHarmPhraseClassifier()});
let spaceId:string,author:{id:string;key:string},reader:{id:string;key:string};
const call=(method:'GET'|'POST',path:string,who:{key:string},body?:unknown)=>app.inject({method,url:'/v1'+path,headers:{authorization:'Bearer '+who.key},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
const write=(body:string,who=author)=>call('POST',`/spaces/${spaceId}/posts`,who,{requestId:randomUUID(),identityMode:'PROFILE',body});
async function member(email:string,name:string){
 const id=randomUUID(),key=newToken();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,'unused','MEMBER','ACTIVE',now())",[id,email]);
 await db.query('INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at) VALUES($1,$2,now())',[id,name]);
 await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),id,digest(key)]);
 return {id,key};
}
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 await db.query('TRUNCATE users,support_spaces,rate_limits CASCADE');
 spaceId=randomUUID();
 await db.query("INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled,commenting_enabled) VALUES($1,'OFFICIAL_SANDAR','Work Stress','Peer support','Adults','Work','Sandar','ACTIVE','test-v1',true,true)",[spaceId]);
 author=await member('author@example.invalid','Author');reader=await member('reader@example.invalid','Reader');
 for(const who of [author,reader])await call('POST',`/spaces/${spaceId}/join`,who,{accepted:true,guidelinesVersion:'test-v1'});
});
afterAll(async()=>{await app.close();await db.end();});

describe('posting with the self-harm phrase filter',()=>{
 it('publishes ordinary posts at once, for everyone',async()=>{
  const made=await write('Hari ini capek banget di kantor.');
  expect(made.json().data.status).toBe('VISIBLE');
  expect((await call('GET',`/spaces/${spaceId}/posts`,reader)).json().data.map((p:{id:string})=>p.id)).toEqual([made.json().data.postId]);
 });

 it('does not publish or store a post about self-harm, and says why',async()=>{
  const r=await write('Aku pengen mati aja.');
  expect(r.statusCode).toBe(422);
  expect(r.json().error.code).toBe('SELF_HARM_SUPPORT');
  expect((await db.query('SELECT count(*)::int AS n FROM space_posts')).rows[0].n).toBe(0);
 });

 it('lets members reply; replies are screened the same way and counted on the post',async()=>{
  const postId=(await write('Ada yang coba istirahat makan siang?')).json().data.postId;
  const reply=(body:string)=>call('POST',`/space-posts/${postId}/comments`,reader,{requestId:randomUUID(),body});
  expect((await reply('Aku coba juga, membantu.')).json().data.status).toBe('VISIBLE');
  const blocked=await reply('I want to die');
  expect(blocked.statusCode).toBe(422);expect(blocked.json().error.code).toBe('SELF_HARM_SUPPORT');
  expect((await call('GET',`/space-posts/${postId}/comments`,author)).json().data.map((c:{body:string})=>c.body)).toEqual(['Aku coba juga, membantu.']);
  expect((await call('GET',`/spaces/${spaceId}/posts`,author)).json().data[0].commentCount).toBe(1);
 });

 it('keeps comments closed where a space has them off',async()=>{
  const postId=(await write('Halo semua.')).json().data.postId;
  await db.query('UPDATE support_spaces SET commenting_enabled=false');
  expect((await call('POST',`/space-posts/${postId}/comments`,reader,{requestId:randomUUID(),body:'Halo'})).statusCode).toBe(403);
 });
});
