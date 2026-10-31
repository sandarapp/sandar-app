import {addDiscovery} from './discovery/routes.js';
import {addCommunityRouting} from './community-routing/routes.js';
import {addMemberHome} from './home/routes.js';
import type {SafetyClassifier} from './spaces/safety.js';
import {addSpaces} from './spaces/routes.js';
import {addModeration} from './moderation/routes.js';
import {addSettings} from './settings/routes.js';
import { addOnboarding } from './onboarding/routes.js';
import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { ZodError } from 'zod';
import * as schemas from '../../../packages/contracts/src/auth.js';
import type { Database } from '../../../packages/database/src/database.js';
import type { EmailProvider } from './notifications/email.js';
import { AuthService } from './auth/service.js';
import { publicUser } from './auth/authorization.js';
import { ApiError, invalidSession } from './core/errors.js';
import { addWebAuth } from './auth/web-session.js';
import { rateLimit } from './core/rate-limit.js';

function bearer(value?: string) {
  if (!value?.startsWith('Bearer ')) throw invalidSession();
  const parsed = schemas.token.safeParse(value.slice(7));
  if (!parsed.success) throw invalidSession();
  return parsed.data;
}
const sameSecret = (given: unknown, expected: string) => {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a,b);
};
export async function buildApp(options: { db: Database; email: EmailProvider; logger?: FastifyServerOptions['logger']; encryptionKey?: string; webOrigin?: string; emailWorker?: boolean; safety?: SafetyClassifier;
  /** Proxy hops in front of the API (Cloud Run: 1). 0 trusts no forwarded headers. */
  trustProxyHops?: number;
  /** Shared with the web app's BFF so it can pass on the visitor's IP for rate limits. */
  bffSecret?: string;
  /** Lets a scheduler drain the email outbox when the host pauses CPU between requests. */
  emailFlushSecret?: string }) {
  const app = Fastify({
    logger: options.logger ?? false, logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 8192, requestTimeout: 10000, connectionTimeout: 10000,
    trustProxy: options.trustProxyHops ? (_address: string,hop: number) => hop < options.trustProxyHops! : false, genReqId: () => randomUUID()
  });
  // Browser traffic arrives through the web app, so its IP is the BFF's. Only the BFF, holding the secret, may name the visitor.
  const clientIp = (request: { ip: string; headers: Record<string,unknown> }) => {
    const forwarded = request.headers['x-sandar-client-ip'];
    if (options.bffSecret && sameSecret(request.headers['x-sandar-bff'],options.bffSecret) && typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
    return request.ip;
  };
  const auth = await AuthService.create(options.db, options.email, () => app.log.error({ event: 'email_delivery_failed' }), options.encryptionKey);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id',request.id).header('cache-control','no-store').header('x-content-type-options','nosniff');
    // No auth material in query strings. Only POST bodies and Authorization are accepted.
    if (request.url.includes('?')) {
      const url=new URL(request.url,'http://localhost');
      const directoryQuery=['/v1/locations/cities','/v1/web/member/locations/cities'].includes(url.pathname) && [...url.searchParams.keys()].every(key=>key==='country'||key==='q') && url.searchParams.getAll('country').length===1 && url.searchParams.getAll('q').length<=1;
      if(!directoryQuery)throw new ApiError(400,'INVALID_QUERY','Parameter URL tidak didukung.');
    }
    if (request.url.startsWith('/v1/auth/') || request.url.startsWith('/v1/web/auth/')) await rateLimit(options.db,`ip:${clientIp(request)}`,60,60);
  });
  app.addHook('onResponse', async (request, reply) => {
    app.log.info({ requestId: request.id, route: request.routeOptions.url ?? 'unmatched', method: request.method, statusCode: reply.statusCode, latencyMs: reply.elapsedTime }, 'request_complete');
  });
  app.setErrorHandler((error,request,reply) => {
    let safe: ApiError;
    if (error instanceof ApiError) safe = error;
    else if (error instanceof ZodError) safe = new ApiError(400,'VALIDATION_ERROR','Periksa isian Anda.',error.issues[0]?.path.join('.') ?? null);
    else if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) safe = new ApiError(error.statusCode,'INVALID_REQUEST','Permintaan tidak valid.');
    else {
      safe = new ApiError(500,'INTERNAL_ERROR','Terjadi kesalahan. Coba lagi nanti.');
      app.log.error({ event: 'request_failed', requestId: request.id });
    }
    if (safe.statusCode === 429) reply.header('retry-after','900');
    return reply.code(safe.statusCode).send({ data: null, error: { code: safe.code,message: safe.message,field: safe.field } });
  });
  app.setNotFoundHandler((_request,reply) => reply.code(404).send({ data: null,error: { code: 'NOT_FOUND',message: 'Halaman tidak ditemukan.',field: null } }));
  const ok = <T>(data: T) => ({ data, error: null });
  app.get('/health',async () => { await options.db.query('SELECT 1'); return ok({ status: 'ok', stage: 'auth-backend-prototype' }); });
  app.get('/v1/policies',async () => ok((await options.db.query('SELECT type,version,locale,content_url AS "contentUrl",effective_at AS "effectiveAt" FROM policies WHERE active AND effective_at<=now() ORDER BY type')).rows));
  for (const [route,type] of [['member','MEMBER'],['community','COMMUNITY']] as const) {
    app.post(`/v1/auth/register/${route}`,async (request,reply) => {
      const input = schemas.registration.parse(request.body);
      await rateLimit(options.db,`register:${input.email}`,5,900);
      return reply.code(202).send(ok(await auth.register(input,type)));
    });
  }
  app.post('/v1/auth/login',async request => {
    const input = schemas.login.parse(request.body);
    await rateLimit(options.db,`login:${input.email}`,10,900);
    return ok(await auth.login(input.email,input.password));
  });
  app.post('/v1/auth/logout',async request => {
    if (request.headers.authorization) return ok(await auth.logout(bearer(request.headers.authorization)));
    return ok(await auth.logoutWithRefresh(schemas.refreshRequest.parse(request.body).refreshToken));
  });
  app.post('/v1/auth/refresh',async request => ok(await auth.refresh(schemas.refreshRequest.parse(request.body).refreshToken)));
  app.post('/v1/auth/email/verify',async request => ok(await auth.verifyEmail(schemas.tokenRequest.parse(request.body).token)));
  for (const [route,purpose] of [['email/resend','VERIFY_EMAIL'],['password/forgot','RESET_PASSWORD']] as const) {
    app.post(`/v1/auth/${route}`,async (request,reply) => {
      const input = schemas.emailRequest.parse(request.body);
      await rateLimit(options.db,`email:${input.email}`,5,900);
      return reply.code(202).send(ok(await auth.requestEmail(input.email,purpose)));
    });
  }
  app.post('/v1/auth/password/reset',async request => {
    const input = schemas.resetRequest.parse(request.body);
    return ok(await auth.resetPassword(input.token,input.password));
  });
  app.get('/v1/users/me',async request => ok(publicUser(await auth.authenticate(bearer(request.headers.authorization)))));
  addOnboarding(app,options.db,auth);
  addSpaces(app,options.db,options.safety);
  addModeration(app,options.db,auth);
  addSettings(app,options.db,auth);
  addMemberHome(app,options.db);
  addDiscovery(app,options.db);
  addCommunityRouting(app,options.db,auth);
  if (options.webOrigin && options.encryptionKey) await addWebAuth(app,options.db,auth,{ origin: options.webOrigin,encryptionKey: options.encryptionKey });
  if (options.emailFlushSecret) {
    const secret = options.emailFlushSecret;
    app.post('/internal/email/flush',async (request,reply) => {
      if (!sameSecret(request.headers['x-sandar-cron'],secret)) return reply.code(404).send({ data: null,error: { code: 'NOT_FOUND',message: 'Halaman tidak ditemukan.',field: null } });
      await auth.flushEmails();
      return ok({ flushed: true });
    });
  }
  if (options.emailWorker) {
    let pending: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (!pending) pending = auth.flushEmails().catch(() => { app.log.error({ event: 'email_worker_failed' }); }).finally(() => { pending = undefined; });
    },1000);
    timer.unref();
    app.addHook('onClose',async () => { clearInterval(timer); await pending; });
  }
  return app;
}
