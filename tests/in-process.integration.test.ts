import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pool } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { digest } from '../apps/api/src/auth/crypto.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== 'localhost' || new URL(url).pathname !== '/sandar_in_process_test') throw new Error('Use isolated localhost/sandar_in_process_test');
const db = new Pool({ connectionString: url, max: 4 });
const origin = 'https://app.example.invalid';
const password = 'only a test password 123';
const sent: { to: string[]; text: string }[] = [];
let call: typeof import('../apps/web/app/api/v1/[...path]/in-process.js').callInProcess;
let floor: number;

beforeAll(async () => {
  await migrate(db);
  Object.assign(process.env, { DATABASE_URL: url, APP_BASE_URL: origin, EMAIL_FROM: 'Sandar <noreply@example.invalid>', RESEND_API_KEY: 're_test', DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex') });
  // Resend is reached over fetch; capture deliveries instead of sending anything.
  vi.stubGlobal('fetch', async (_target: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response('{"id":"test"}', { status: 200 });
  });
  ({ callInProcess: call, EMAIL_FLOOR_MS: floor } = await import('../apps/web/app/api/v1/[...path]/in-process.js'));
});
beforeEach(async () => {
  await db.query('TRUNCATE users,policies,rate_limits,email_outbox CASCADE');
  for (const type of ['TERMS', 'PRIVACY_NOTICE']) await db.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,'test-v1','id-ID',now(),'https://example.invalid/p',true)", [randomUUID(), type]);
  sent.length = 0;
});
afterAll(async () => { vi.unstubAllGlobals(); await db.end(); });

const web = { origin, 'x-sandar-client': 'web', 'content-type': 'application/json' };
const consents = ['TERMS', 'PRIVACY_NOTICE'].map(type => ({ type, policyVersion: 'test-v1', locale: 'id-ID', accepted: true }));
const post = (path: string, body: unknown, visitorIp: string | null = null, headers: Record<string, string> = web) =>
  call({ method: 'POST', path, search: '', headers, body: JSON.stringify(body), visitorIp });
async function timed<T>(work: () => Promise<T>) { const start = Date.now(); const result = await work(); return { result, ms: Date.now() - start }; }

describe('API running inside the web app', () => {
  it('serves public endpoints without a separate API server', async () => {
    const response = await call({ method: 'GET', path: 'policies', search: '', headers: { 'x-sandar-client': 'web' }, visitorIp: null });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((p: { type: string }) => p.type).sort()).toEqual(['PRIVACY_NOTICE', 'TERMS']);
  });

  it('sends the verification email during registration, never faster than the floor', async () => {
    const { result, ms } = await timed(() => post('auth/register/member', { email: 'new@example.invalid', password, consents }));
    expect(result.statusCode).toBe(202);
    expect(ms).toBeGreaterThanOrEqual(floor - 20);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(['new@example.invalid']);
    expect(sent[0]!.text).toContain(`${origin}/verify-email#token=`);
    expect((await db.query("SELECT status FROM email_outbox")).rows.map(r => r.status)).toEqual(['SENT']);
  });

  it('takes the same time for a known and an unknown address on password reset', async () => {
    await post('auth/register/member', { email: 'known@example.invalid', password, consents });
    const known = await timed(() => post('auth/password/forgot', { email: 'known@example.invalid' }));
    const unknown = await timed(() => post('auth/password/forgot', { email: 'unknown@example.invalid' }));
    expect(known.result.statusCode).toBe(unknown.result.statusCode);
    expect(Math.min(known.ms, unknown.ms)).toBeGreaterThanOrEqual(floor - 20);
    expect(Math.abs(known.ms - unknown.ms)).toBeLessThan(400);
  });

  it('logs in through the cookie session', async () => {
    await post('auth/register/member', { email: 'rani@example.invalid', password, consents });
    const token = sent.at(-1)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
    expect((await post('auth/email/verify', { token })).statusCode).toBe(200);
    const login = await post('web/auth/login', { email: 'rani@example.invalid', password });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    expect(cookie).toMatch(/^sandar_session=/);
    const session = await call({ method: 'GET', path: 'web/auth/session', search: '', headers: { ...web, cookie }, visitorIp: null });
    expect(session.json().data).toMatchObject({ email: 'rani@example.invalid', accountType: 'MEMBER' });
  });

  it('rate limits by the visitor IP it is given', async () => {
    await post('auth/password/forgot', { email: 'x@example.invalid' }, '203.0.113.21');
    expect((await db.query('SELECT 1 FROM rate_limits WHERE key_hash=$1', [digest('ip:203.0.113.21')])).rowCount).toBe(1);
  });
});
