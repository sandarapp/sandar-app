import { randomUUID, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { buildApp } from '../apps/api/src/app.js';
import { SecretBox } from '../apps/api/src/core/encryption.js';
import { DevelopmentEmailProvider } from '../apps/api/src/notifications/development-email.js';
import { EmailOutbox } from '../apps/api/src/notifications/outbox.js';
import { renderEmail } from '../apps/api/src/notifications/templates.js';
import { mkdtemp, readdir, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transaction } from '../packages/database/src/database.js';
import { AuthService } from '../apps/api/src/auth/service.js';
import { digest, newToken } from '../apps/api/src/auth/crypto.js';
import type { EmailMessage, EmailProvider } from '../apps/api/src/notifications/email.js';

// Deliberately fail instead of silently skipping security integration tests.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required; use a disposable local database ending in _test.');
const url = new URL(connectionString);
if (!url.pathname.endsWith('_test') || !['localhost','127.0.0.1',''].includes(url.hostname)) throw new Error('Integration tests require a local database ending in _test.');
const db = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 3000 });
class TestEmail implements EmailProvider {
  messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push(message); }
  latest(template: EmailMessage['template']) { return this.messages.filter(m => m.template === template).at(-1)!; }
}
const email = new TestEmail();
let app: FastifyInstance;
const address = 'member@example.invalid', password = 'only a test password 123';
const consents = [
  { type: 'TERMS',policyVersion: 'test-v1',locale: 'id-ID',accepted: true },
  { type: 'PRIVACY_NOTICE',policyVersion: 'test-v1',locale: 'id-ID',accepted: true }
];
const post = (path: string,payload: unknown) => app.inject({ method: 'POST',url: `/v1/auth/${path}`,payload: payload as Record<string,unknown> });
async function register(kind = 'member',mail = address) {
  return post(`register/${kind}`,{ email: mail,password,consents });
}
async function verified(kind = 'member',mail = address) {
  expect((await register(kind,mail)).statusCode).toBe(202);
  expect((await post('email/verify',{ token: email.latest('VERIFY_EMAIL').token })).statusCode).toBe(200);
  const result = await post('login',{ email: mail,password });
  expect(result.statusCode).toBe(200);
  return result.json().data as {accessToken: string; refreshToken: string; user: {id: string;status: string;accountType: string}};
}
const me = (token: string) => app.inject({ method: 'GET',url: '/v1/users/me',headers: { authorization: `Bearer ${token}` } });

beforeAll(async () => { await migrate(db); app = await buildApp({ db,email }); });
beforeEach(async () => {
  await db.query('TRUNCATE consent_records,refresh_tokens,sessions,action_tokens,users,policies,rate_limits CASCADE');
  for (const type of ['TERMS','PRIVACY_NOTICE']) await db.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,'test-v1','id-ID',now(),'https://example.invalid/development-policy',true)",[randomUUID(),type]);
  email.messages = [];
});
afterAll(async () => { await app?.close(); await db.end(); });

describe('authentication API against PostgreSQL',() => {
  it('migrations are repeatable and policy discovery works',async () => {
    await migrate(db);
    const res = await app.inject('/v1/policies');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });
  it('registers with hashed secrets, versioned consent, and a generic response',async () => {
    const result = await register();
    expect(result.statusCode).toBe(202);
    expect(result.body).not.toContain(address);
    expect(result.body).not.toContain(email.latest('VERIFY_EMAIL').token);
    const user = (await db.query('SELECT * FROM users')).rows[0];
    expect(user.status).toBe('EMAIL_UNVERIFIED');
    expect(user.password_hash).not.toContain(password);
    expect((await db.query('SELECT * FROM consent_records')).rowCount).toBe(2);
    const tokens = (await db.query('SELECT * FROM action_tokens')).rows;
    expect(tokens[0].token_hash).toBe(digest(email.latest('VERIFY_EMAIL').token!));
  });
  it('normalizes duplicate email without overwriting credentials or granting roles',async () => {
    const first = await register();
    const second = await post('register/community',{ email: 'MEMBER@example.invalid',password: 'an attacker password',consents });
    expect(second.body).toBe(first.body);
    expect((await db.query('SELECT * FROM users')).rowCount).toBe(1);
    expect((await db.query('SELECT account_type FROM users')).rows[0].account_type).toBe('MEMBER');
    expect(email.messages).toHaveLength(1);
  });
  it('handles concurrent duplicate registration atomically',async () => {
    const results = await Promise.all([register(),register()]);
    expect(results.map(r => r.statusCode)).toEqual([202,202]);
    expect((await db.query('SELECT * FROM users')).rowCount).toBe(1);
    expect((await db.query('SELECT * FROM consent_records')).rowCount).toBe(2);
  });
  it('rejects missing, stale or withdrawn policy acceptance',async () => {
    expect((await post('register/member',{ email: address,password,consents: [] })).statusCode).toBe(400);
    expect((await post('register/member',{ email: address,password,consents: consents.map(c => ({ ...c,policyVersion: 'old' })) })).statusCode).toBe(409);
    expect((await post('register/member',{ email: address,password,consents: consents.map(c => ({ ...c,accepted: false })) })).statusCode).toBe(400);
    expect((await db.query('SELECT * FROM users')).rowCount).toBe(0);
  });
  it.each(['role','accountType','status','emailVerifiedAt'])('rejects client-supplied %s',async field => {
    expect((await post('register/member',{ email: address,password,consents,[field]: 'SUPER_ADMIN' })).statusCode).toBe(400);
  });
  it('rejects login before verification; verification does not activate community',async () => {
    await register('community');
    expect((await post('login',{ email: address,password })).statusCode).toBe(403);
    const token = email.latest('VERIFY_EMAIL').token;
    expect((await post('email/verify',{ token })).statusCode).toBe(200);
    const result = await post('login',{ email: address,password });
    expect(result.json().data.user).toMatchObject({ accountType: 'COMMUNITY',status: 'ONBOARDING_INCOMPLETE' });
    expect((await post('email/verify',{ token })).statusCode).toBe(400);
  });
  it('verification is single-use even with simultaneous clicks',async () => {
    await register();
    const token = email.latest('VERIFY_EMAIL').token;
    const results = await Promise.all([post('email/verify',{ token }),post('email/verify',{ token })]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200,400]);
  });
  it('expired verification can recover via resend; old links stay invalid',async () => {
    await register();
    const token = email.latest('VERIFY_EMAIL').token;
    await db.query("UPDATE action_tokens SET expires_at=now()-interval '1 second'");
    expect((await post('email/verify',{ token })).statusCode).toBe(400);
    expect((await post('email/resend',{ email: address })).statusCode).toBe(202);
    expect((await post('email/verify',{ token: email.latest('VERIFY_EMAIL').token })).statusCode).toBe(200);
    expect((await post('email/verify',{ token })).statusCode).toBe(400);
  });
  it('hides whether an email exists for recovery and wrong-password login',async () => {
    await register();
    for (const route of ['email/resend','password/forgot']) {
      const existing = await post(route,{ email: address });
      const missing = await post(route,{ email: 'missing@example.invalid' });
      expect(existing.body).toBe(missing.body);
    }
    expect((await post('login',{ email: address,password: 'incorrect' })).body).toBe((await post('login',{ email: 'missing@example.invalid',password: 'incorrect' })).body);
  });
  it('requires authentication and does not expose credential material',async () => {
    expect((await app.inject('/v1/users/me')).statusCode).toBe(401);
    expect((await me(newToken())).statusCode).toBe(401);
    const session = await verified();
    const result = await me(session.accessToken);
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(Object.keys(result.json().data).sort()).toEqual(['id','email','accountType','status','emailVerifiedAt'].sort());
    expect((await app.inject(`/v1/users/${randomUUID()}`)).statusCode).toBe(404);
  });
  it('rotates refresh tokens and revokes the family on replay',async () => {
    const session = await verified();
    const rotated = await post('refresh',{ refreshToken: session.refreshToken });
    expect(rotated.statusCode).toBe(200);
    expect((await me(session.accessToken)).statusCode).toBe(401);
    expect((await me(rotated.json().data.accessToken)).statusCode).toBe(200);
    expect((await post('refresh',{ refreshToken: session.refreshToken })).statusCode).toBe(401);
    expect((await me(rotated.json().data.accessToken)).statusCode).toBe(401);
    expect((await post('refresh',{ refreshToken: rotated.json().data.refreshToken })).statusCode).toBe(401);
  });
  it('rejects simultaneous reuse and revokes the winning refresh session',async () => {
    const session = await verified();
    const results = await Promise.all([post('refresh',{ refreshToken: session.refreshToken }),post('refresh',{ refreshToken: session.refreshToken })]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200,401]);
    const success = results.find(r => r.statusCode === 200)!;
    expect((await me(success.json().data.accessToken)).statusCode).toBe(401);
  });
  it('rejects invalid refresh and enforces access and absolute session expiry',async () => {
    expect((await post('refresh',{ refreshToken: newToken() })).statusCode).toBe(401);
    const session = await verified();
    await db.query("UPDATE sessions SET access_expires_at=now()-interval '1 second'");
    expect((await me(session.accessToken)).statusCode).toBe(401);
    const rotated = await post('refresh',{ refreshToken: session.refreshToken });
    expect(rotated.statusCode).toBe(200);
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
    expect((await post('refresh',{ refreshToken: rotated.json().data.refreshToken })).statusCode).toBe(401);
    expect((await me(rotated.json().data.accessToken)).statusCode).toBe(401);
  });
  it.each(['SUSPENDED','DEACTIVATED','DELETED'])('denies %s on existing sessions and login',async status => {
    const session = await verified();
    await db.query('UPDATE users SET status=$1',[status]);
    expect((await me(session.accessToken)).statusCode).toBe(401);
    expect((await post('refresh',{ refreshToken: session.refreshToken })).statusCode).toBe(401);
    expect((await post('login',{ email: address,password })).statusCode).toBe(401);
  });
  it('logout is idempotent and revokes refresh',async () => {
    const session = await verified();
    for (let n = 0;n < 2;n++) expect((await app.inject({ method: 'POST',url: '/v1/auth/logout',headers: { authorization: `Bearer ${session.accessToken}` } })).statusCode).toBe(200);
    expect((await me(session.accessToken)).statusCode).toBe(401);
    expect((await post('refresh',{ refreshToken: session.refreshToken })).statusCode).toBe(401);
  });
  it('logout cannot revoke a different user session',async () => {
    const a = await verified();
    const b = await verified('member','second@example.invalid');
    await app.inject({ method: 'POST',url: '/v1/auth/logout',headers: { authorization: `Bearer ${a.accessToken}` } });
    expect((await me(a.accessToken)).statusCode).toBe(401);
    expect((await me(b.accessToken)).statusCode).toBe(200);
  });
  it('password reset is purpose-bound, single-use and revokes all sessions',async () => {
    const session = await verified();
    expect((await post('password/reset',{ token: email.latest('VERIFY_EMAIL').token,password: 'replacement test password' })).statusCode).toBe(400);
    await post('password/forgot',{ email: address });
    const token = email.latest('RESET_PASSWORD').token;
    expect((await post('email/verify',{ token })).statusCode).toBe(400);
    expect((await post('password/reset',{ token,password: 'replacement test password' })).statusCode).toBe(200);
    expect((await post('password/reset',{ token,password: 'replacement test password' })).statusCode).toBe(400);
    expect((await me(session.accessToken)).statusCode).toBe(401);
    expect((await post('refresh',{ refreshToken: session.refreshToken })).statusCode).toBe(401);
    expect((await post('login',{ email: address,password })).statusCode).toBe(401);
    expect((await post('login',{ email: address,password: 'replacement test password' })).statusCode).toBe(200);
    expect(email.latest('SECURITY_ALERT').token).toBeUndefined();
  });
  it('expired reset leaves credentials unchanged',async () => {
    await verified();
    await post('password/forgot',{ email: address });
    await db.query("UPDATE action_tokens SET expires_at=now()-interval '1 second'");
    expect((await post('password/reset',{ token: email.latest('RESET_PASSWORD').token,password: 'replacement test password' })).statusCode).toBe(400);
    expect((await post('login',{ email: address,password })).statusCode).toBe(200);
  });
  it('enforces shared account rate limits and returns retry guidance',async () => {
    for (let n=0;n<5;n++) expect((await post('password/forgot',{ email: address })).statusCode).toBe(202);
    const limited = await post('email/resend',{ email: address });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('900');
    expect(limited.json().error.code).toBe('RATE_LIMITED');
  });
  it('IP rate limits cannot be bypassed by forwarded headers',async () => {
    for (let n=0;n<60;n++) await app.inject({ method: 'POST',url: '/v1/auth/login',payload: {},headers: { 'x-forwarded-for': `10.0.0.${n}` } });
    expect((await post('login',{})).statusCode).toBe(429);
  });
  it('returns safe errors for invalid JSON, oversized body, invalid tokens and unknown routes',async () => {
    const malformed = await app.inject({ method: 'POST',url: '/v1/auth/login',payload: '{',headers: { 'content-type': 'application/json' } });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error).not.toHaveProperty('stack');
    expect((await post('email/verify',{ token: 'bad' })).statusCode).toBe(400);
    expect((await post('login',{ email: address,password: 'x'.repeat(9000) })).statusCode).toBe(413);
    expect((await app.inject('/v1/users/me?token=secret')).statusCode).toBe(400);
    expect((await app.inject('/v1/admin/users')).statusCode).toBe(404);
  });
  it('provider failure preserves generic responses and can be retried via resend',async () => {
    let failures = 0;
    const broken = await AuthService.create(db,{ send: async () => { throw new Error('provider secret'); } },() => { failures++; });
    const result = await broken.requestEmail('missing@example.invalid','VERIFY_EMAIL');
    await register();
    expect(await broken.requestEmail(address,'VERIFY_EMAIL')).toEqual(result);
    expect(failures).toBe(1);
    expect((await post('email/resend',{ email: address })).statusCode).toBe(202);
    expect((await post('email/verify',{ token: email.latest('VERIFY_EMAIL').token })).statusCode).toBe(200);
  });
  it('logs only safe metadata, including for query secrets and internal failures',async () => {
    const lines: string[] = [];
    const logged = await buildApp({ db,email,logger: { stream: { write(line: string) { lines.push(line); } } } });
    const session = await verified();
    try {
      await logged.inject({ method: 'POST',url: '/v1/auth/login',payload: { email: address,password } });
      await logged.inject({ method: 'GET',url: '/v1/users/me',headers: { authorization: `Bearer ${session.accessToken}` } });
      await logged.inject(`/v1/users/me?token=${session.refreshToken}`);
      const query = vi.spyOn(db,'query').mockRejectedValueOnce(new Error('private SQL failure sentinel'));
      const failed = await logged.inject('/health');
      query.mockRestore();
      expect(failed.statusCode).toBe(500);
      expect(failed.json().error.code).toBe('INTERNAL_ERROR');
      const output = lines.join('');
      expect(output).toContain('request_complete');
      expect(output).toContain('request_failed');
      for (const secret of [password,address,session.accessToken,session.refreshToken,'private SQL failure sentinel']) {
        expect(output).not.toContain(secret);
        expect(failed.body).not.toContain(secret);
      }
    } finally { vi.restoreAllMocks(); await logged.close(); }
  });
});

describe('Epic 1 delivery and cookie session completion',()=>{
  const key = randomBytes(32).toString('hex');
  const origin = 'http://localhost:3000';
  const headers = { origin,'x-sandar-client':'web','content-type':'application/json' };
  async function webApp() { return buildApp({db,email,encryptionKey:key,webOrigin:origin}); }
  async function browserLogin(web: FastifyInstance) {
    const result = await web.inject({method:'POST',url:'/v1/web/auth/login',headers,payload:{email:address,password}});
    expect(result.statusCode).toBe(200);
    return {result,cookie:String(result.headers['set-cookie']).split(';')[0]!};
  }
  it('sends both action templates to a private local inbox, with fragment links',async()=>{
    const directory = await mkdtemp(join(tmpdir(),'sandar-mail-test-'));
    const dev = new DevelopmentEmailProvider(directory,origin);
    const service = await AuthService.create(db,dev,()=>{},key);
    try {
      await service.register({email:address,password,consents:consents as Parameters<AuthService['register']>[0]['consents']},'MEMBER');
      let files=await readdir(directory);expect(files).toHaveLength(1);
      const verify=JSON.parse(await readFile(join(directory,files[0]!),'utf8'));
      expect(new URL(verify.link).pathname).toBe('/verify-email');expect(new URL(verify.link).search).toBe('');
      expect(new URL(verify.link).hash).toMatch(/^#token=[A-Za-z0-9_-]{43}$/);
      expect((await stat(join(directory,files[0]!))).mode & 0o777).toBe(0o600);
      await service.requestEmail(address,'RESET_PASSWORD');
      files=await readdir(directory);expect(files).toHaveLength(2);
      const messages=await Promise.all(files.map(async f=>JSON.parse(await readFile(join(directory,f),'utf8'))));
      expect(messages.some(m=>new URL(m.link).pathname==='/reset-password')).toBe(true);
      expect((await db.query("SELECT payload_encrypted FROM email_outbox WHERE status='SENT'")).rows.every(r=>r.payload_encrypted===null)).toBe(true);
    } finally {await rm(directory,{recursive:true,force:true});}
  });
  it('binds encryption to record purpose and rejects tampering',()=>{
    const box=new SecretBox(key);const sealed=box.seal({token:'secret'},'email:a');
    expect(box.open(sealed,'email:a')).toEqual({token:'secret'});
    expect(()=>box.open(sealed,'web:a')).toThrow();
    expect(()=>box.open(sealed.slice(0,-4)+'AAAA','email:a')).toThrow();
  });
  it('refuses unsafe email URLs and escapes HTML link output',()=>{
    expect(()=>renderEmail({to:address,template:'VERIFY_EMAIL',token:newToken()},'http://external.example')).toThrow();
    expect(()=>renderEmail({to:address,template:'VERIFY_EMAIL',token:newToken()},'https://user:secret@example.com')).toThrow();
    expect(renderEmail({to:address,template:'SECURITY_ALERT'},origin).html).not.toContain('href=');
  });
  it('outbox enqueue rolls back atomically with its transaction',async()=>{
    const outbox=new EmailOutbox(db,email,key);
    await expect(transaction(db,async tx=>{await outbox.enqueue(tx,{to:address,template:'SECURITY_ALERT'});throw new Error('rollback');})).rejects.toThrow('rollback');
    expect((await db.query('SELECT * FROM email_outbox')).rowCount).toBe(0);
  });
  it('retries durable mail once across concurrent workers, then clears ciphertext',async()=>{
    let failing=true;const send=vi.fn(async()=>{if(failing)throw new Error('secret provider error');});
    const outbox=new EmailOutbox(db,{send},key);
    await transaction(db,tx=>outbox.enqueue(tx,{to:address,template:'SECURITY_ALERT'}));
    const before=(await db.query('SELECT payload_encrypted FROM email_outbox')).rows[0].payload_encrypted;
    expect(before).not.toContain(address);
    await outbox.flush();expect(send).toHaveBeenCalledTimes(1);
    expect((await db.query('SELECT status,attempts FROM email_outbox')).rows[0]).toMatchObject({status:'PENDING',attempts:1});
    failing=false;await db.query('UPDATE email_outbox SET next_attempt_at=now()');
    await Promise.all([outbox.flush(),outbox.flush()]);expect(send).toHaveBeenCalledTimes(2);
    expect((await db.query('SELECT status,payload_encrypted FROM email_outbox')).rows[0]).toMatchObject({status:'SENT',payload_encrypted:null});
  });
  it('cancels expired mail and stops retrying permanently failed delivery',async()=>{
    const send=vi.fn(async()=>{throw new Error('provider failed');});const outbox=new EmailOutbox(db,{send},key);
    await transaction(db,tx=>outbox.enqueue(tx,{to:address,template:'SECURITY_ALERT'}));
    await db.query("UPDATE email_outbox SET expires_at=now()-interval '1 second'");await outbox.flush();
    expect(send).not.toHaveBeenCalled();expect((await db.query('SELECT status FROM email_outbox')).rows[0].status).toBe('CANCELLED');
    await transaction(db,tx=>outbox.enqueue(tx,{to:address,template:'SECURITY_ALERT'}));
    for(let n=0;n<5;n++){await db.query('UPDATE email_outbox SET next_attempt_at=now()');await outbox.flush();}
    expect(send).toHaveBeenCalledTimes(5);
    expect((await db.query("SELECT payload_encrypted FROM email_outbox WHERE status='FAILED'")).rows[0].payload_encrypted).toBeNull();
  });
  it('sets HttpOnly SameSite cookies and returns no bearer credentials',async()=>{
    await verified();const web=await webApp();
    try {
      const {result,cookie}=await browserLogin(web);
      expect(result.headers['set-cookie']).toContain('HttpOnly');expect(result.headers['set-cookie']).toContain('SameSite=Strict');
      expect(result.body).not.toMatch(/accessToken|refreshToken|password_hash/);
      const handle=cookie.split('=')[1]!;
      const row=(await db.query('SELECT * FROM web_sessions')).rows[0];
      expect(row.cookie_hash).toBe(digest(handle));expect(row.credentials_encrypted).not.toContain(handle);
      const session=await web.inject({url:'/v1/web/auth/session',headers:{...headers,cookie}});
      expect(session.statusCode).toBe(200);expect(session.json().data.email).toBe(address);
    } finally {await web.close();}
  });
  it('rejects CSRF and forged handles and keeps raw login off the web route',async()=>{
    const web=await webApp();
    try {
      expect((await web.inject({method:'POST',url:'/v1/web/auth/login',headers:{...headers,origin:'https://evil.example'},payload:{email:address,password}})).statusCode).toBe(403);
      expect((await web.inject({url:'/v1/web/auth/session',headers:{...headers,cookie:`sandar_session=${newToken()}`}})).statusCode).toBe(401);
      expect((await web.inject({method:'POST',url:'/v1/web/auth/refresh',headers,payload:{refreshToken:newToken()}})).statusCode).toBe(404);
    } finally {await web.close();}
  });
  it('serializes parallel browser refresh beyond pool size without replay or deadlock',async()=>{
    await verified();const web=await webApp();
    try {
      const {cookie}=await browserLogin(web);
      await db.query("UPDATE sessions SET access_expires_at=now()-interval '1 second'");
      const results=await Promise.all(Array.from({length:12},()=>web.inject({url:'/v1/web/auth/session',headers:{...headers,cookie}})));
      expect(results.every(r=>r.statusCode===200)).toBe(true);
      const result=await db.query('SELECT count(*) FROM refresh_tokens r JOIN web_sessions w ON w.session_id=r.session_id');expect(result.rows[0].count).toBe('2');
    } finally {await web.close();}
  });
  it('enforces suspension and reset revocation through existing browser handles',async()=>{
    await verified();const web=await webApp();
    try {
      const first=await browserLogin(web);
      await db.query("UPDATE users SET status='SUSPENDED'");
      const denied=await web.inject({url:'/v1/web/auth/session',headers:{...headers,cookie:first.cookie}});
      expect(denied.statusCode).toBe(401);expect(denied.headers['set-cookie']).toContain('Max-Age=0');
      await db.query("UPDATE users SET status='ONBOARDING_INCOMPLETE'");
      const second=await browserLogin(web);await post('password/forgot',{email:address});
      await post('password/reset',{token:email.latest('RESET_PASSWORD').token,password:'replacement test password'});
      expect((await web.inject({url:'/v1/web/auth/session',headers:{...headers,cookie:second.cookie}})).statusCode).toBe(401);
    } finally {await web.close();}
  });
  it('cookie logout is idempotent and revokes the underlying server session',async()=>{
    await verified();const web=await webApp();
    try {
      const {cookie}=await browserLogin(web);
      const sessionId=(await db.query('SELECT session_id FROM web_sessions')).rows[0].session_id;
      for(let n=0;n<2;n++)expect((await web.inject({method:'POST',url:'/v1/web/auth/logout',headers:{...headers,cookie},payload:{}})).statusCode).toBe(200);
      expect((await db.query('SELECT revoked_at FROM sessions WHERE id=$1',[sessionId])).rows[0].revoked_at).not.toBeNull();
      expect((await web.inject({url:'/v1/web/auth/session',headers:{...headers,cookie}})).statusCode).toBe(401);
    } finally {await web.close();}
  });
});
