import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool, connection } from '../../../../../../packages/database/src/database';
import { buildApp } from '../../../../../api/src/app';
import { ResendEmailProvider } from '../../../../../api/src/notifications/resend-email';
import { HumanReviewSafetyClassifier } from '../../../../../api/src/spaces/safety';

// Runs the Sandar API inside the web app (SANDAR_API_MODE=in-process), for
// serverless hosts such as Netlify that run no separate API server. One small
// pool per function instance; instances are reused between requests.

// Per-instance secrets: only this module can reach the flush endpoint or
// vouch for a visitor's IP, because nothing else talks to the in-process API.
const bffSecret = randomBytes(24).toString('hex');
const flushSecret = randomBytes(24).toString('hex');

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let api: Promise<FastifyInstance> | null = null;
function instance() {
  api ??= (async () => buildApp({
    db: new Pool({ ...connection(required('DATABASE_URL')), max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, statement_timeout: 5000 }),
    email: new ResendEmailProvider(required('RESEND_API_KEY'), required('EMAIL_FROM'), required('APP_BASE_URL')),
    encryptionKey: required('DATA_ENCRYPTION_KEY'),
    webOrigin: required('APP_BASE_URL'),
    safety: new HumanReviewSafetyClassifier(),
    bffSecret,
    emailFlushSecret: flushSecret
  }))().catch(error => { api = null; throw error; });
  return api;
}

// Routes that queue an email. The email is sent before answering, and the
// answer never comes sooner than this floor, so response time cannot reveal
// whether an address has an account.
const EMAIL_ROUTES = new Set(['auth/register/member', 'auth/register/community', 'auth/email/resend', 'auth/password/forgot', 'auth/password/reset']);
export const EMAIL_FLOOR_MS = 2500;

export interface ApiCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  search: string;
  headers: Record<string, string>;
  body?: string;
  visitorIp: string | null;
}

export async function callInProcess(call: ApiCall) {
  const started = Date.now();
  const app = await instance();
  const response = await app.inject({
    method: call.method,
    url: `/v1/${call.path}${call.search}`,
    headers: { ...call.headers, ...(call.visitorIp ? { 'x-sandar-bff': bffSecret, 'x-sandar-client-ip': call.visitorIp } : {}) },
    ...(call.body !== undefined ? { payload: call.body } : {})
  });
  if (EMAIL_ROUTES.has(call.path) && response.statusCode < 500) {
    await app.inject({ method: 'POST', url: '/internal/email/flush', headers: { 'x-sandar-cron': flushSecret } }).catch(() => {});
    const wait = EMAIL_FLOOR_MS - (Date.now() - started);
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  }
  return response;
}
