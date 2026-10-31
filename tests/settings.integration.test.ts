import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,hashPassword,newToken,verifyPassword} from '../apps/api/src/auth/crypto.js';
const url=process.env.TEST_DATABASE_URL;
if(!url||new URL(url).hostname!=='localhost'||new URL(url).pathname!=='/sandar_settings_test')throw new Error('Use isolated localhost/sandar_settings_test');
const db=new Pool({connectionString:url});
const app=await buildApp({db,email:{send:async()=>{}},encryptionKey:'a'.repeat(64)});
type Who={id:string;key:string};
let a:Who,b:Who,c:Who;
const OLD='old password 12345';
const call=(method:'GET'|'POST'|'PATCH',path:string,who:{key:string},body?:unknown)=>app.inject({method,url:'/v1'+path,headers:{authorization:'Bearer '+who.key},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
const session=async(id:string)=>{const key=newToken();await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),id,digest(key)]);return key;};
async function member(email:string,name:string,hash:string){
 const id=randomUUID();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,$3,'MEMBER','ACTIVE',now())",[id,email,hash]);
 await db.query("INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at) VALUES($1,$2,now())",[id,name]);
 return {id,key:await session(id)};
}
const privacy=(displayName:string,extra={})=>({displayName,language:'id-ID',profileVisibility:'HIDDEN',directoryVisibility:'HIDDEN',allowAnonymousPosting:true,...extra});
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 await db.query('TRUNCATE users,rate_limits,email_outbox CASCADE');
 const hash=await hashPassword(OLD);
 a=await member('a@example.invalid','Ana',hash);b=await member('b@example.invalid','Budi',hash);c=await member('c@example.invalid','Citra',hash);
});
afterAll(async()=>{await app.close();await db.end();});
const profile=async(id:string)=>(await db.query('SELECT * FROM member_profiles WHERE user_id=$1',[id])).rows[0];

describe('member settings',()=>{
 it('changes only the caller\'s privacy, and rejects extra fields such as another user id',async()=>{
  expect((await call('PATCH','/settings/privacy',a,privacy('Ana',{profileVisibility:'MEMBERS'}))).statusCode).toBe(200);
  expect((await profile(a.id)).profile_visibility).toBe('MEMBERS');
  expect((await profile(b.id)).profile_visibility).not.toBe('MEMBERS');
  expect((await call('PATCH','/settings/privacy',a,{...privacy('Ana'),userId:b.id})).statusCode).toBe(400);
 });

 it('allows one display name change every 30 days; other settings stay free',async()=>{
  expect((await call('PATCH','/settings/privacy',a,privacy('Ana Baru'))).statusCode).toBe(200);
  const again=await call('PATCH','/settings/privacy',a,privacy('Ana Lagi'));
  expect(again.statusCode).toBe(409);expect(again.json().error.code).toBe('DISPLAY_NAME_TOO_SOON');
  expect((await call('PATCH','/settings/privacy',a,privacy('Ana Baru',{allowAnonymousPosting:false}))).statusCode).toBe(200);
  await db.query("UPDATE member_profiles SET display_name_changed_at=now()-interval '31 days' WHERE user_id=$1",[a.id]);
  expect((await call('PATCH','/settings/privacy',a,privacy('Ana Lagi'))).statusCode).toBe(200);
 });

 it('saves preferences and location after onboarding and validates them',async()=>{
  expect((await call('PATCH','/settings/preferences',a,{needs:['BURNOUT'],goals:['READ_QUIETLY'],communityType:'ONLINE'})).statusCode).toBe(200);
  expect((await profile(a.id)).needs).toEqual(['BURNOUT']);
  expect((await call('PATCH','/settings/preferences',a,{needs:['NOPE'],goals:[],communityType:'ONLINE'})).statusCode).toBe(400);
  expect((await call('PATCH','/settings/location',a,{source:'MANUAL',country:'ID',city:'Malang',permission:'NOT_REQUESTED'})).statusCode).toBe(200);
  expect((await profile(a.id)).city).toBe('Malang');
  expect((await call('PATCH','/settings/location',a,{source:'MANUAL',country:'ZZ',city:'X',permission:'NOT_REQUESTED'})).statusCode).toBe(400);
 });

 it('changes the password only with the current one, keeps this session and ends the others',async()=>{
  const other={key:await session(a.id)};
  const wrong=await call('POST','/settings/password',a,{currentPassword:'not my password',newPassword:'new password 12345'});
  expect(wrong.statusCode).toBe(400);expect(wrong.json().error.code).toBe('CURRENT_PASSWORD_WRONG');
  expect((await call('GET','/users/me',other)).statusCode).toBe(200);
  expect((await call('POST','/settings/password',a,{currentPassword:OLD,newPassword:'short'})).statusCode).toBe(400);
  expect((await call('POST','/settings/password',a,{currentPassword:OLD,newPassword:'new password 12345'})).statusCode).toBe(200);
  const hash=(await db.query('SELECT password_hash FROM users WHERE id=$1',[a.id])).rows[0].password_hash;
  expect(await verifyPassword('new password 12345',hash)).toBe(true);
  expect((await call('GET','/users/me',a)).statusCode).toBe(200);
  expect((await call('GET','/users/me',other)).statusCode).toBe(401);
  expect((await call('GET','/users/me',b)).statusCode).toBe(200);
  expect((await db.query("SELECT count(*)::int AS n FROM email_outbox")).rows[0].n).toBe(1);
 });

 it('limits password attempts',async()=>{
  const codes=[];for(let i=0;i<6;i++)codes.push((await call('POST','/settings/password',a,{currentPassword:'wrong',newPassword:'new password 12345'})).statusCode);
  expect(codes.at(-1)).toBe(429);
 });

 it('signs out other sessions of this account only',async()=>{
  const other={key:await session(a.id)};
  expect((await call('POST','/settings/sessions/revoke-others',a,{})).json().data).toEqual({revoked:1});
  expect((await call('GET','/users/me',other)).statusCode).toBe(401);
  expect((await call('GET','/users/me',a)).statusCode).toBe(200);
  expect((await call('GET','/users/me',b)).statusCode).toBe(200);
 });

 it('lists blocks without identifying anyone; another member cannot unblock them',async()=>{
  await db.query('INSERT INTO member_blocks(blocker_user_id,blocked_user_id) VALUES($1,$2)',[a.id,b.id]);
  const list=await call('GET','/settings/blocks',a);
  expect(list.body).not.toContain(b.id);expect(list.body).not.toContain('Budi');expect(list.body).not.toContain('b@example');
  const ref=list.json().data[0].ref;
  expect((await call('POST',`/settings/blocks/${ref}/unblock`,c,{})).statusCode).toBe(404);
  expect((await db.query('SELECT 1 FROM member_blocks')).rowCount).toBe(1);
  expect((await call('POST',`/settings/blocks/${ref}/unblock`,a,{})).json().data).toEqual({unblocked:true});
  expect((await call('GET','/settings/blocks',a)).json().data).toEqual([]);
 });

 it('needs a session, a member account and finished onboarding',async()=>{
  expect((await app.inject({method:'GET',url:'/v1/settings/blocks'})).statusCode).toBe(401);
  await db.query('UPDATE member_profiles SET onboarding_completed_at=NULL WHERE user_id=$1',[a.id]);
  expect((await call('PATCH','/settings/privacy',a,privacy('Ana'))).statusCode).toBe(403);
  await db.query("UPDATE users SET account_type='COMMUNITY' WHERE id=$1",[b.id]);
  expect((await call('GET','/settings/blocks',b)).statusCode).toBe(403);
 });
});
