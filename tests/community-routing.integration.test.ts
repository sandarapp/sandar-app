import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_foundation_test')throw new Error('Use isolated localhost/sandar_foundation_test');
const db=new Pool({connectionString:url}),app=await buildApp({db,email:{send:async()=>{}}});let userId:string,access:string;
beforeAll(()=>migrate(db));
beforeEach(async()=>{await db.query('TRUNCATE users,rate_limits CASCADE');userId=randomUUID();access=newToken();await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,'community@example.invalid','unused','COMMUNITY','ONBOARDING_INCOMPLETE',now())",[userId]);await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),userId,digest(access)]);});
afterAll(async()=>{await app.close();await db.end();});
const req=()=>app.inject({url:'/v1/community-applications/me',headers:{authorization:'Bearer '+access}});
describe('owner-scoped Community routing',()=>{
 it('new verified Community is DRAFT, never approved by verification',async()=>{expect((await req()).json().data).toEqual({status:'DRAFT',capabilities:{applicationEditing:false,portal:false}});});
 it.each(['DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_MORE_INFORMATION','APPROVED','REJECTED'])('returns canonical %s',async status=>{await db.query('INSERT INTO community_application_states(user_id,status) VALUES($1,$2)',[userId,status]);expect((await req()).json().data.status).toBe(status);});
 it('requires authentication',async()=>expect((await app.inject('/v1/community-applications/me')).statusCode).toBe(401));
 it('rejects member accounts',async()=>{await db.query("UPDATE users SET account_type='MEMBER' WHERE id=$1",[userId]);expect((await req()).statusCode).toBe(403);});
 it('rejects revoked sessions',async()=>{await db.query('UPDATE sessions SET revoked_at=now()');expect((await req()).statusCode).toBe(401);});
 it('rejects email-unverified accounts',async()=>{await db.query('UPDATE users SET email_verified_at=NULL');expect((await req()).statusCode).toBe(403);});
 it('offers no self-approval mutation or user-id lookup',async()=>{expect((await app.inject({method:'POST',url:'/v1/community-applications/me',payload:{status:'APPROVED'},headers:{authorization:'Bearer '+access}})).statusCode).toBe(404);expect((await app.inject({url:'/v1/community-applications/'+randomUUID(),headers:{authorization:'Bearer '+access}})).statusCode).toBe(404);});
 it('accepts authoritative English policy versions for new Community registration',async()=>{
  for(const type of ['TERMS','PRIVACY_NOTICE'])await db.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,'foundation-test','en',now(),'/legal',true) ON CONFLICT DO NOTHING",[randomUUID(),type]);
  const r=await app.inject({method:'POST',url:'/v1/auth/register/community',payload:{email:'new-community@example.invalid',password:'foundation password 123',consents:['TERMS','PRIVACY_NOTICE'].map(type=>({type,locale:'en',policyVersion:'foundation-test',accepted:true}))}});
  expect(r.statusCode).toBe(202);const row=(await db.query("SELECT account_type,status FROM users WHERE email='new-community@example.invalid'")).rows[0];expect(row).toEqual({account_type:'COMMUNITY',status:'EMAIL_UNVERIFIED'});
 });

});
