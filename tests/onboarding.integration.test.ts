import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {Pool} from '../packages/database/src/database.js';
import {migrate} from '../packages/database/src/migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {digest,newToken} from '../apps/api/src/auth/crypto.js';
const url=process.env.TEST_DATABASE_URL;
if(!url || new URL(url).pathname!=='/sandar_onboarding_test' || new URL(url).hostname!=='localhost')throw new Error('Use isolated localhost/sandar_onboarding_test');
const db=new Pool({connectionString:url});
const app=await buildApp({db,email:{send:async()=>{}}});
const access=newToken();let userId:string;
const req=(path:string,body?:unknown,method:'GET'|'PATCH'|'POST' = body===undefined?'GET':'PATCH',locale='en')=>app.inject({method,url:'/v1/users/me'+path,headers:{authorization:'Bearer '+access,'accept-language':locale},...(body===undefined?{}:{payload:body as Record<string,unknown>})});
const location={source:'MANUAL',country:'ID',city:'Makassar',permission:'NOT_REQUESTED'};
const preferences={needs:[],goals:[],communityType:'NO_PREFERENCE'};
const privacy={language:'en',displayName:'Sample member',profileVisibility:'HIDDEN',directoryVisibility:'HIDDEN',allowAnonymousPosting:true};
async function ready(){await req('/onboarding/age',{confirmed:true});await req('/onboarding/boundaries',{accepted:true,policyVersion:'test-onboarding-v1',locale:'en'});await req('/location',location);await req('/preferences',preferences);await req('/privacy',privacy);}
beforeAll(()=>migrate(db));
beforeEach(async()=>{
 await db.query('TRUNCATE users,policies,onboarding_analytics CASCADE');userId=randomUUID();
 await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,'onboarding@example.invalid','unused','MEMBER','ONBOARDING_INCOMPLETE',now())",[userId]);
 await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')",[randomUUID(),userId,digest(access)]);
 await db.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,'COMMUNITY_GUIDELINES','test-onboarding-v1','en',now(),'https://example.invalid/guidelines',true)",[randomUUID()]);
});
afterAll(async()=>{await app.close();await db.end();});
describe('member onboarding API and persistence',()=>{
 it('supports Indonesian policy selection without hardcoded acceptance locale',async()=>{
  await db.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,'COMMUNITY_GUIDELINES','test-id-v1','id-ID',now(),'https://example.invalid/guidelines',true)",[randomUUID()]);
  expect((await req('/onboarding',undefined,'GET','id-ID')).json().data.policy.locale).toBe('id-ID');
  const result=await req('/onboarding/boundaries',{accepted:true,policyVersion:'test-id-v1',locale:'id-ID'},'PATCH','id-ID');
  expect(result.statusCode).toBe(200);expect(result.json().data.boundariesLocale).toBe('id-ID');
  expect((await db.query('SELECT locale FROM consent_records')).rows[0].locale).toBe('id-ID');
 });
 it('rejects acceptance in a locale different from the selected policy',async()=>{
  expect((await req('/onboarding/boundaries',{accepted:true,policyVersion:'test-onboarding-v1',locale:'id-ID'})).statusCode).toBe(409);
 });
 it('requires a valid session',async()=>expect((await app.inject('/v1/users/me/onboarding')).statusCode).toBe(401));
 it('reads safe defaults and does not create a profile on GET',async()=>{expect((await req('/onboarding')).json().data).toMatchObject({ageConfirmed:false,completedAt:null,location:null});expect((await db.query('SELECT * FROM member_profiles')).rowCount).toBe(0);});
 it.each(['COMMUNITY','SUSPENDED'])('rejects ineligible account %s',async state=>{await db.query(state==='COMMUNITY'?"UPDATE users SET account_type='COMMUNITY'":"UPDATE users SET status='SUSPENDED'");expect([401,403]).toContain((await req('/onboarding/age',{confirmed:true})).statusCode);});
 it('refuses age false and malformed extra fields',async()=>{expect((await req('/onboarding/age',{confirmed:false})).statusCode).toBe(400);expect((await req('/onboarding/age',{confirmed:true,userId:randomUUID()})).statusCode).toBe(400);});
 it('refuses premature completion',async()=>expect((await req('/onboarding/complete',{},'POST')).statusCode).toBe(409));
 it('validates policy version and explicit acceptance',async()=>{expect((await req('/onboarding/boundaries',{accepted:false,policyVersion:'test-onboarding-v1',locale:'en'})).statusCode).toBe(400);expect((await req('/onboarding/boundaries',{accepted:true,policyVersion:'stale',locale:'en'})).statusCode).toBe(409);});
 it('records versioned boundaries consent',async()=>{await req('/onboarding/boundaries',{accepted:true,policyVersion:'test-onboarding-v1',locale:'en'});expect((await db.query('SELECT status,policy_version FROM consent_records')).rows[0]).toMatchObject({status:'ACCEPTED',policy_version:'test-onboarding-v1'});});
 it('rejects exact coordinates and incomplete manual location',async()=>{expect((await req('/location',{...location,latitude:-5,longitude:119})).statusCode).toBe(400);expect((await req('/location',{...location,city:''})).statusCode).toBe(400);});
 it.each(['DENIED','NOT_REQUESTED','GRANTED'])('supports location skip with %s',async permission=>{const res=await req('/location',{source:'SKIPPED',country:null,city:null,permission});expect(res.statusCode).toBe(200);expect(res.json().data.location.city).toBeNull();});
 it('does not accept device location without permission',async()=>expect((await req('/location',{...location,source:'DEVICE'})).statusCode).toBe(400));
 it('permits empty needs and goals but rejects diagnosis fields',async()=>{expect((await req('/preferences',preferences)).statusCode).toBe(200);expect((await req('/preferences',{...preferences,diagnosis:'anything'})).statusCode).toBe(400);});
 it('requires explicit privacy and nonempty display name',async()=>expect((await req('/privacy',{...privacy,displayName:'  '})).statusCode).toBe(400));
 it('persists all choices; completion is repeatable and survives a fresh GET',async()=>{
  await ready();const res=await req('/onboarding/complete',{},'POST');expect(res.statusCode).toBe(200);const saved=res.json().data;
  expect(saved).toMatchObject({location,preferences,privacy});expect(saved.completedAt).toBeTruthy();
  expect((await req('/onboarding')).json().data).toEqual(saved);
  expect((await req('/onboarding/complete',{},'POST')).json().data.completedAt).toBe(saved.completedAt);
  expect((await db.query('SELECT status FROM users WHERE id=$1',[userId])).rows[0].status).toBe('ACTIVE');
 });
 it('rejects a revoked consent at completion',async()=>{await ready();await db.query("UPDATE consent_records SET status='WITHDRAWN'");expect((await req('/onboarding/complete',{},'POST')).statusCode).toBe(409);});
 it('never writes another member profile from a supplied id',async()=>{const other=randomUUID();await db.query("INSERT INTO users(id,email,password_hash,account_type) VALUES($1,'other@example.invalid','unused','MEMBER')",[other]);expect((await req('/privacy',{...privacy,userId:other})).statusCode).toBe(400);expect((await db.query('SELECT * FROM member_profiles WHERE user_id=$1',[other])).rowCount).toBe(0);});
});

describe('canonical F03 contracts and transaction guarantees',()=>{
 it('denies unverified members',async()=>{await db.query("UPDATE users SET email_verified_at=NULL,status='EMAIL_UNVERIFIED' WHERE id=$1",[userId]);expect((await req('/onboarding')).statusCode).toBe(403);});
 it('blocks progress bypass of age and boundaries',async()=>{expect((await req('/onboarding/progress',{step:9})).statusCode).toBe(409);await req('/onboarding/age',{confirmed:true});expect((await req('/onboarding/progress',{step:4})).statusCode).toBe(409);});
 it('saves interests, participation and format independently',async()=>{expect((await req('/interests',{needs:['BURNOUT','LONELINESS']})).statusCode).toBe(200);let s=(await req('/onboarding')).json().data;expect(s).toMatchObject({interestsSaved:true,participationSaved:false,formatSaved:false,preferences:{needs:['BURNOUT','LONELINESS'],goals:[]}});expect((await req('/participation',{goals:['READ_QUIETLY','FIND_COMMUNITIES']})).statusCode).toBe(200);expect((await req('/community-format',{communityType:'MIXED'})).statusCode).toBe(200);s=(await req('/onboarding')).json().data;expect(s.preferences).toEqual({needs:['BURNOUT','LONELINESS'],goals:['READ_QUIETLY','FIND_COMMUNITIES'],communityType:'MIXED'});expect(s).toMatchObject({interestsSaved:true,participationSaved:true,formatSaved:true});});
 it('rejects prefer-not-to-say mixed with another interest',async()=>{expect((await req('/interests',{needs:['PREFER_NOT_TO_SAY','BURNOUT']})).statusCode).toBe(400);expect((await req('/interests',{needs:['PREFER_NOT_TO_SAY']})).statusCode).toBe(200);});
 it('scopes directory cities to country and exposes only coarse aliases',async()=>{const headers={authorization:'Bearer '+access};const c=await app.inject({url:'/v1/locations/cities?country=ID&q=Maka',headers});expect(c.json().data).toEqual(['Makassar']);expect((await req('/location',{...location,source:'DIRECTORY',city:'Sydney'})).statusCode).toBe(400);const res=await req('/location',{...location,source:'DIRECTORY'});expect(res.statusCode).toBe(200);expect(res.json().data.location).toEqual({...location,source:'DIRECTORY',countryCode:'ID',countryName:'Indonesia',cityName:'Makassar',locationSource:'DIRECTORY'});expect((await req('/location',{...location,country:'ZZ'})).statusCode).toBe(400);});
 it('rejects sensitive analytics and client completion claims',async()=>{for(const extra of [{diagnosis:'x'},{latitude:1},{narrative:'x'},{needs:['BURNOUT']},{userId}])expect((await req('/onboarding/analytics',{event:'support_interest_selected',...extra},'POST')).statusCode).toBe(400);expect((await req('/onboarding/analytics',{event:'member_onboarding_completed'},'POST')).statusCode).toBe(400);expect((await req('/onboarding/analytics',{event:'support_interest_selected',step:5},'POST')).statusCode).toBe(200);expect((await db.query('SELECT event,step FROM onboarding_analytics')).rows).toEqual([{event:'support_interest_selected',step:5}]);});
 it('serializes duplicate completion and records success exactly once',async()=>{await ready();const results=await Promise.all([req('/onboarding/complete',{},'POST'),req('/onboarding/complete',{},'POST')]);expect(results.map(r=>r.statusCode)).toEqual([200,200]);expect(results[0]!.json().data.completedAt).toBe(results[1]!.json().data.completedAt);expect((await db.query("SELECT count(*)::int AS n FROM onboarding_analytics WHERE event='member_onboarding_completed'")).rows[0].n).toBe(1);});
 it('rolls back completion and ACTIVE on persistence failure',async()=>{await ready();await db.query("CREATE FUNCTION f03_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated persistence failure'; END $$");try{await db.query('CREATE TRIGGER f03_test_failure BEFORE INSERT ON onboarding_analytics FOR EACH ROW EXECUTE FUNCTION f03_test_fail()');expect((await req('/onboarding/complete',{},'POST')).statusCode).toBe(500);expect((await req('/onboarding')).json().data.completedAt).toBeNull();expect((await db.query('SELECT status FROM users WHERE id=$1',[userId])).rows[0].status).toBe('ONBOARDING_INCOMPLETE');}finally{await db.query('DROP TRIGGER IF EXISTS f03_test_failure ON onboarding_analytics');await db.query('DROP FUNCTION f03_test_fail()');}});
});

it('keeps auth queries and unexpected directory parameters forbidden',async()=>{for(const url of ['/v1/auth/login?country=ID','/v1/locations/cities?country=ID&token=secret','/v1/locations/cities?country=ID&country=AU'])expect((await app.inject({url,headers:{authorization:'Bearer '+access}})).statusCode).toBe(400);});
