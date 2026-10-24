import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { buildApp } from '../apps/api/src/app.js';
import { memberRouteAllowed } from '../packages/contracts/src/web-member.js';
import type { EmailMessage, EmailProvider } from '../apps/api/src/notifications/email.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== 'localhost' || new URL(url).pathname !== '/sandar_web_member_test') throw new Error('Use isolated localhost/sandar_web_member_test');
const db = new Pool({ connectionString: url, max: 8 });
class TestEmail implements EmailProvider {
  messages: EmailMessage[] = [];
  async send(message: EmailMessage) { this.messages.push(message); }
}
const email = new TestEmail();
const origin = 'http://localhost:3000';
const headers = { origin, 'x-sandar-client': 'web' };
const password = 'only a test password 123';
let app: FastifyInstance, spaceId: string, postId: string;

async function account(kind: 'member' | 'community', address: string) {
  const consents = ['TERMS', 'PRIVACY_NOTICE'].map(type => ({ type, policyVersion: 'test-v1', locale: 'id-ID', accepted: true }));
  expect((await app.inject({ method: 'POST', url: `/v1/auth/register/${kind}`, payload: { email: address, password, consents } })).statusCode).toBe(202);
  const token = email.messages.filter(m => m.template === 'VERIFY_EMAIL').at(-1)!.token;
  expect((await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { token } })).statusCode).toBe(200);
  const login = await app.inject({ method: 'POST', url: '/v1/web/auth/login', headers: { ...headers, 'content-type': 'application/json' }, payload: { email: address, password } });
  expect(login.statusCode).toBe(200);
  return String(login.headers['set-cookie']).split(';')[0]!;
}
function member(cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, extra: Record<string, string> = {}) {
  return app.inject({
    method, url: `/v1/web/member/${path}`,
    headers: { ...headers, cookie, 'accept-language': 'id-ID', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extra },
    ...(body !== undefined ? { payload: JSON.stringify(body) } : {})
  });
}
async function onboard(cookie: string) {
  const steps: [string, unknown][] = [
    ['users/me/onboarding/progress', { step: 1 }],
    ['users/me/onboarding/age', { confirmed: true }],
    ['users/me/onboarding/progress', { step: 3 }],
    ['users/me/onboarding/boundaries', { accepted: true, locale: 'id-ID', policyVersion: 'test-v1' }],
    ['users/me/location', { source: 'SKIPPED', country: null, city: null, permission: 'NOT_REQUESTED' }],
    ['users/me/interests', { needs: ['BURNOUT'] }],
    ['users/me/participation', { goals: ['READ_QUIETLY'] }],
    ['users/me/community-format', { communityType: 'ONLINE' }],
    ['users/me/privacy', { displayName: 'Rani', language: 'id-ID', profileVisibility: 'HIDDEN', directoryVisibility: 'HIDDEN', allowAnonymousPosting: true }]
  ];
  for (const [path, body] of steps) expect((await member(cookie, 'PATCH', path, body)).statusCode, path).toBe(200);
  expect((await member(cookie, 'POST', 'users/me/onboarding/complete', {})).statusCode).toBe(200);
}

beforeAll(async () => {
  await migrate(db);
  app = await buildApp({ db, email, encryptionKey: randomBytes(32).toString('hex'), webOrigin: origin });
});
beforeEach(async () => {
  await db.query('TRUNCATE users,policies,support_spaces,rate_limits,onboarding_analytics CASCADE');
  for (const type of ['TERMS', 'PRIVACY_NOTICE', 'COMMUNITY_GUIDELINES']) await db.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,'test-v1','id-ID',now(),'https://example.invalid/policy',true)", [randomUUID(), type]);
  spaceId = randomUUID(); postId = randomUUID();
  // Launch configuration: members can read and react, posting and commenting stay closed.
  await db.query("INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled,commenting_enabled) VALUES($1,'OFFICIAL_SANDAR','Work Stress','Peer support','Adults','Work','Sandar','ACTIVE','test-v1',false,false)", [spaceId]);
  await db.query("INSERT INTO space_posts(id,space_id,author_user_id,identity_mode,body,request_id,status) VALUES($1,$2,NULL,'ANNOUNCEMENT','Welcome to the space.',$3,'VISIBLE')", [postId, spaceId, randomUUID()]);
  email.messages = [];
});
afterAll(async () => { await app?.close(); await db.end(); });

describe('member cookie gateway', () => {
  it('runs onboarding, then read and react on a launch space, all through the cookie', async () => {
    const cookie = await account('member', 'rani@example.invalid');
    const before = await member(cookie, 'GET', 'users/me/onboarding');
    expect(before.statusCode).toBe(200);
    expect(before.json().data).toMatchObject({ completedAt: null, policy: { version: 'test-v1', locale: 'id-ID' } });
    expect((await member(cookie, 'GET', 'spaces')).statusCode).toBe(403);
    await onboard(cookie);

    expect((await member(cookie, 'GET', 'home')).json().data).toMatchObject({ displayName: 'Rani', joinedSpaceIds: [] });
    expect((await member(cookie, 'POST', `spaces/${spaceId}/join`, { accepted: true, guidelinesVersion: 'test-v1' })).json().data)
      .toMatchObject({ membership: 'JOINED', permissions: { read: true, post: false, comment: false } });
    const feed = await member(cookie, 'GET', `spaces/${spaceId}/posts`);
    expect(feed.json().data.map((p: { id: string }) => p.id)).toEqual([postId]);
    const reacted = await member(cookie, 'POST', `space-posts/${postId}/reactions`, { type: 'SUPPORT' });
    expect(reacted.json().data.reactions.find((r: { type: string }) => r.type === 'SUPPORT').selected).toBe(true);
    const removed = await member(cookie, 'DELETE', `space-posts/${postId}/reactions/SUPPORT`);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.reactions.every((r: { selected: boolean }) => !r.selected)).toBe(true);
    expect((await member(cookie, 'POST', 'discovery/search', {})).json().data.results[0]).toMatchObject({ id: spaceId });
  });

  it('allows only the city directory query string', async () => {
    const cookie = await account('member', 'rani@example.invalid');
    expect((await member(cookie, 'GET', 'locations/cities?country=ID&q=band')).statusCode).toBe(200);
    expect((await member(cookie, 'GET', 'home?debug=1')).statusCode).toBe(400);
  });

  it('keeps posting, comments and unknown paths closed', async () => {
    const cookie = await account('member', 'rani@example.invalid');
    await onboard(cookie);
    await member(cookie, 'POST', `spaces/${spaceId}/join`, { accepted: true, guidelinesVersion: 'test-v1' });
    for (const [method, path] of [
      ['POST', `spaces/${spaceId}/posts`], ['POST', `space-posts/${postId}/comments`], ['POST', 'auth/logout'],
      ['GET', 'spaces/not-a-uuid'], ['GET', `spaces/${spaceId}/../../auth/session`], ['PATCH', 'home']
    ] as const) expect((await member(cookie, method, path, method === 'GET' ? undefined : { body: 'x' })).statusCode, `${method} ${path}`).toBe(404);
    expect(await db.query('SELECT 1 FROM space_posts WHERE author_user_id IS NOT NULL')).toMatchObject({ rowCount: 0 });
  });

  it('rejects requests without the cookie, from another origin or without the web marker', async () => {
    const cookie = await account('member', 'rani@example.invalid');
    expect((await app.inject({ method: 'GET', url: '/v1/web/member/home', headers })).statusCode).toBe(401);
    expect((await member(cookie, 'GET', 'users/me/onboarding', undefined, { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/v1/web/member/users/me/onboarding', headers: { origin, cookie } })).statusCode).toBe(403);
    expect((await member('sandar_session=' + 'a'.repeat(43), 'GET', 'users/me/onboarding')).statusCode).toBe(401);
  });

  it('refreshes an expired access token behind the cookie', async () => {
    const cookie = await account('member', 'rani@example.invalid');
    await db.query("UPDATE sessions SET access_expires_at=now()-interval '1 second'");
    expect((await member(cookie, 'GET', 'users/me/onboarding')).statusCode).toBe(200);
    expect((await member(cookie, 'GET', 'users/me/onboarding')).statusCode).toBe(200);
  });

  it('ends the browser session after logout', async () => {
    const cookie = await account('member', 'rani@example.invalid');
    await app.inject({ method: 'POST', url: '/v1/web/auth/logout', headers: { ...headers, cookie, 'content-type': 'application/json' }, payload: {} });
    expect((await member(cookie, 'GET', 'users/me/onboarding')).statusCode).toBe(401);
  });

  it('still applies member-only rules to community accounts', async () => {
    const cookie = await account('community', 'group@example.invalid');
    expect((await member(cookie, 'GET', 'users/me/onboarding')).statusCode).toBe(403);
    expect((await member(cookie, 'GET', 'community-applications/me')).statusCode).toBe(200);
  });

  it('exposes a strict allowlist', () => {
    expect(memberRouteAllowed('GET', 'home')).toBe(true);
    expect(memberRouteAllowed('POST', 'home')).toBe(false);
    expect(memberRouteAllowed('POST', `spaces/${randomUUID()}/posts`)).toBe(false);
    expect(memberRouteAllowed('DELETE', `space-posts/${randomUUID()}/reactions/LIKE`)).toBe(false);
  });
});
