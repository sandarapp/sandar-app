import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { buildApp } from '../apps/api/src/app.js';
import { digest, newToken } from '../apps/api/src/auth/crypto.js';
import { renderEmail } from '../apps/api/src/notifications/templates.js';
import { SmtpEmailProvider } from '../apps/api/src/notifications/smtp-email.js';
import { ResendEmailProvider } from '../apps/api/src/notifications/resend-email.js';
import { HumanReviewSafetyClassifier } from '../apps/api/src/spaces/safety.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== 'localhost' || new URL(url).pathname !== '/sandar_production_test') throw new Error('Use isolated localhost/sandar_production_test');
const db = new Pool({ connectionString: url, max: 6 });
const bffSecret = 'b'.repeat(40), flushSecret = 'f'.repeat(40);
let app: FastifyInstance;

beforeAll(async () => {
  await migrate(db);
  app = await buildApp({ db, email: { send: async () => {} }, bffSecret, emailFlushSecret: flushSecret, trustProxyHops: 1, safety: new HumanReviewSafetyClassifier() });
});
beforeEach(async () => {
  await db.query('TRUNCATE users,policies,support_spaces,rate_limits,email_outbox CASCADE');
  for (const type of ['TERMS', 'PRIVACY_NOTICE']) await db.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,'test-v1','id-ID',now(),'https://example.invalid/p',true)", [randomUUID(), type]);
});
afterAll(async () => { await app?.close(); await db.end(); });

const register = (headers: Record<string, string> = {}) => app.inject({
  method: 'POST', url: '/v1/auth/register/member', headers,
  payload: { email: `m${randomUUID().slice(0, 8)}@example.invalid`, password: 'only a test password 123', consents: ['TERMS', 'PRIVACY_NOTICE'].map(type => ({ type, policyVersion: 'test-v1', locale: 'id-ID', accepted: true })) }
});
// Rate-limit keys are stored hashed; hash the expected key the same way.
const limited = async (ip: string) => Boolean((await db.query('SELECT 1 FROM rate_limits WHERE key_hash=$1', [digest(`ip:${ip}`)])).rowCount);

describe('production hardening', () => {
  it('opens the email flush endpoint only to a caller holding the secret', async () => {
    expect((await app.inject({ method: 'POST', url: '/internal/email/flush' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/internal/email/flush', headers: { 'x-sandar-cron': 'wrong' } })).statusCode).toBe(404);
    const ok = await app.inject({ method: 'POST', url: '/internal/email/flush', headers: { 'x-sandar-cron': flushSecret } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data).toEqual({ flushed: true });
  });

  it('rate limits by the visitor IP the BFF forwards, but only with the shared secret', async () => {
    await register({ 'x-sandar-bff': bffSecret, 'x-sandar-client-ip': '203.0.113.7' });
    expect(await limited('203.0.113.7')).toBe(true);
    await db.query('TRUNCATE rate_limits');
    await register({ 'x-sandar-bff': 'not-the-secret', 'x-sandar-client-ip': '203.0.113.8' });
    await register({ 'x-sandar-bff': bffSecret, 'x-sandar-client-ip': 'not-an-ip' });
    expect(await limited('203.0.113.8')).toBe(false);
    expect(await limited('not-an-ip')).toBe(false);
  });

  it('uses the last proxy-appended address when one proxy hop is trusted', async () => {
    await register({ 'x-forwarded-for': '198.51.100.1, 203.0.113.9' });
    expect(await limited('203.0.113.9')).toBe(true);
    expect(await limited('198.51.100.1')).toBe(false);
  });

  it('holds every post for a human when the launch safety adapter is on', async () => {
    const userId = randomUUID(), key = newToken(), spaceId = randomUUID();
    await db.query("INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,'p@example.invalid','unused','MEMBER','ACTIVE',now())", [userId]);
    await db.query('INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at) VALUES($1,$2,now())', [userId, 'Rani']);
    await db.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes',now()+interval '1 day')", [randomUUID(), userId, digest(key)]);
    await db.query("INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled) VALUES($1,'OFFICIAL_SANDAR','S','P','A','T','Sandar','ACTIVE','v1',true)", [spaceId]);
    const auth = { authorization: `Bearer ${key}` };
    await app.inject({ method: 'POST', url: `/v1/spaces/${spaceId}/join`, headers: auth, payload: { accepted: true, guidelinesVersion: 'v1' } });
    const posted = await app.inject({ method: 'POST', url: `/v1/spaces/${spaceId}/posts`, headers: auth, payload: { requestId: randomUUID(), identityMode: 'PROFILE', body: 'A hard week.' } });
    expect(posted.json().data.status).toBe('PENDING_REVIEW');
    expect((await app.inject({ method: 'GET', url: `/v1/spaces/${spaceId}/posts`, headers: auth })).json().data).toEqual([]);
  });
});

describe('production email', () => {
  it('drops the development footer for https links and keeps it for local ones', () => {
    const message = { to: 'a@example.invalid', template: 'VERIFY_EMAIL' as const, token: 'A'.repeat(43) };
    expect(renderEmail(message, 'https://app.hellosandar.com').text).not.toContain('PENGEMBANGAN');
    expect(renderEmail(message, 'https://app.hellosandar.com').link).toMatch(/^https:\/\/app\.hellosandar\.com\/verify-email#token=/);
    expect(renderEmail(message, 'http://localhost:3002').text).toContain('PENGEMBANGAN');
  });

  it('sends the rendered template over SMTP from the configured sender', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const captured: string[] = [];
    const wrapped = { sendMail: async (mail: Parameters<typeof transport.sendMail>[0]) => { const info = await transport.sendMail(mail); captured.push(String(info.message)); return info; } };
    const provider = new SmtpEmailProvider({ host: 'smtp.example.invalid', port: 465, user: 'u', password: 'p', from: 'Sandar <hellosandar@zohomail.com>' }, 'https://app.hellosandar.com', wrapped as never);
    await provider.send({ id: randomUUID(), to: 'member@example.invalid', template: 'RESET_PASSWORD', token: 'B'.repeat(43) });
    const mail = JSON.parse(captured[0]!);
    expect(mail.from.address).toBe('hellosandar@zohomail.com');
    expect(mail.subject).toBe('Atur ulang kata sandi Sandar');
    expect(mail.text).toContain('https://app.hellosandar.com/reset-password#token=');
  });

  it('sends through Resend with an idempotency key and fails without echoing the recipient', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let status = 200;
    const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status }); }) as unknown as typeof fetch;
    const provider = new ResendEmailProvider('re_test_key', 'Sandar <noreply@hellosandar.com>', 'https://app.hellosandar.com', fetcher);
    const id = randomUUID();
    await provider.send({ id, to: 'member@example.invalid', template: 'VERIFY_EMAIL', token: 'C'.repeat(43) });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(headers.authorization).toBe('Bearer re_test_key');
    expect(headers['idempotency-key']).toBe(id);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ from: 'Sandar <noreply@hellosandar.com>', to: ['member@example.invalid'], subject: 'Verifikasi email Sandar Anda' });
    expect(body.text).toContain('https://app.hellosandar.com/verify-email#token=');
    status = 422;
    await expect(provider.send({ to: 'member@example.invalid', template: 'VERIFY_EMAIL', token: 'C'.repeat(43) })).rejects.toThrow(/^Resend rejected the email \(422\)$/);
  });
});
