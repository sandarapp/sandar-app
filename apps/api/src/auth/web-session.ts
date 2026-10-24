import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { transaction, type Database } from '../../../../packages/database/src/database.js';
import * as schema from '../../../../packages/contracts/src/auth.js';
import { memberRouteAllowed } from '../../../../packages/contracts/src/web-member.js';
import { SecretBox } from '../core/encryption.js';
import { ApiError, invalidSession } from '../core/errors.js';
import { rateLimit } from '../core/rate-limit.js';
import { digest, newToken } from './crypto.js';
import { publicUser } from './authorization.js';
import type { AuthService } from './service.js';

const credentialSchema = z.object({ accessToken: schema.token, refreshToken: schema.token });
const COOKIE = 'sandar_session';
function cookie(request: FastifyRequest) {
  const cookies = (request.headers.cookie ?? '').split(';').map(c => c.trim()).filter(c => c.startsWith(`${COOKIE}=`));
  if (cookies.length !== 1) return null;
  return schema.token.safeParse(cookies[0]!.slice(COOKIE.length + 1)).data ?? null;
}
export async function addWebAuth(app: FastifyInstance, db: Database, auth: AuthService, options: { origin: string; encryptionKey: string }) {
  const origin = new URL(options.origin).origin;
  const secure = origin.startsWith('https:');
  const box = new SecretBox(options.encryptionKey);
  const setCookie = (reply: FastifyReply, value: string, clear = false) => reply.header('set-cookie', `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 2592000}${secure ? '; Secure' : ''}`);
  const ok = <T>(data: T) => ({ data, error: null });
  // Turns the browser cookie into a live access token, refreshing it when it
  // has expired. Returns null (and drops the handle) when the session is gone.
  async function resolve(request: FastifyRequest) {
    const raw = cookie(request);
    if (!raw) return null;
    const hash = digest(raw);
    return transaction(db, async tx => {
      // Database lock serializes refresh across tabs AND API instances. Cookie stays stable.
      const row = (await tx.query<{credentials_encrypted: string}>('SELECT credentials_encrypted FROM web_sessions WHERE cookie_hash=$1 AND expires_at>now() FOR UPDATE', [hash])).rows[0];
      if (!row) return null;
      try {
        let credentials = credentialSchema.parse(box.open(row.credentials_encrypted,`web:${hash}`));
        let user;
        try { user = await auth.authenticate(credentials.accessToken,tx); }
        catch (error) {
          if (!(error instanceof ApiError) || error.statusCode !== 401) throw error;
          credentials = await auth.refresh(credentials.refreshToken,tx);
          await tx.query('UPDATE web_sessions SET credentials_encrypted=$1 WHERE cookie_hash=$2',[box.seal(credentials,`web:${hash}`),hash]);
          user = await auth.authenticate(credentials.accessToken,tx);
        }
        return { user, accessToken: credentials.accessToken };
      } catch (error) {
        if (!(error instanceof ApiError) || ![401,403].includes(error.statusCode)) throw error;
        await tx.query('DELETE FROM web_sessions WHERE cookie_hash=$1',[hash]);
        return null;
      }
    });
  }
  await app.register(async web => {
    web.addHook('onRequest', async request => {
      // Next's same-origin route forwards Origin; no trust in caller-provided user/role headers.
      if (request.headers.origin !== origin || request.headers['x-sandar-client'] !== 'web') throw new ApiError(403,'CSRF_REJECTED','Permintaan tidak diizinkan.');
      if (['POST','PATCH'].includes(request.method) && !request.headers['content-type']?.startsWith('application/json')) throw new ApiError(415,'JSON_REQUIRED','Gunakan JSON.');
    });
    web.post('/v1/web/auth/login', async (request, reply) => {
      const input = schema.login.parse(request.body);
      await rateLimit(db,`login:${input.email}`,10,900);
      const result = await auth.login(input.email,input.password);
      const raw = newToken(), hash = digest(raw);
      try {
        const session = await auth.authenticate(result.accessToken);
        await db.query(`INSERT INTO web_sessions(cookie_hash,session_id,credentials_encrypted,expires_at)
          SELECT $1,id,$2,expires_at FROM sessions WHERE id=$3`, [hash,box.seal({ accessToken: result.accessToken,refreshToken: result.refreshToken },`web:${hash}`),session.session_id]);
        // Rotate the browser handle on every login and revoke any previous handle's underlying session.
        const old = cookie(request);
        if (old) await transaction(db, async tx => {
          const previous = (await tx.query<{session_id: string}>('DELETE FROM web_sessions WHERE cookie_hash=$1 RETURNING session_id',[digest(old)])).rows[0];
          if (previous) await tx.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[previous.session_id]);
        });
      } catch (error) { await auth.logout(result.accessToken); throw error; }
      setCookie(reply,raw);
      return ok(result.user);
    });
    web.get('/v1/web/auth/session', async (request,reply) => {
      const resolved = await resolve(request);
      if (!resolved) { setCookie(reply,'',true); throw invalidSession(); }
      return ok(publicUser(resolved.user));
    });
    web.route({ method: ['GET','POST','PATCH','DELETE'], url: '/v1/web/member/*', handler: async (request,reply) => {
      const url = new URL(request.url,'http://localhost');
      const path = url.pathname.slice('/v1/web/member/'.length);
      if (!memberRouteAllowed(request.method,path)) throw new ApiError(404,'NOT_FOUND','Halaman tidak ditemukan.');
      const resolved = await resolve(request);
      if (!resolved) { setCookie(reply,'',true); throw invalidSession(); }
      const language = request.headers['accept-language'];
      const response = await app.inject({
        method: request.method as 'GET'|'POST'|'PATCH'|'DELETE',
        url: `/v1/${path}${url.search}`,
        headers: {
          authorization: `Bearer ${resolved.accessToken}`,
          ...(typeof language === 'string' && /^(en|id-ID)$/.test(language) ? { 'accept-language': language } : {}),
          ...(request.body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(request.body !== undefined ? { payload: JSON.stringify(request.body) } : {})
      });
      const retry = response.headers['retry-after'];
      if (retry) reply.header('retry-after',String(retry));
      return reply.code(response.statusCode).type('application/json; charset=utf-8').send(response.payload);
    } });
    web.post('/v1/web/auth/logout',async (request,reply) => {
      const raw = cookie(request);
      if (raw) await transaction(db, async tx => {
        const row = (await tx.query<{session_id: string}>('DELETE FROM web_sessions WHERE cookie_hash=$1 RETURNING session_id',[digest(raw)])).rows[0];
        if (row) await tx.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[row.session_id]);
      });
      setCookie(reply,'',true);
      return ok({ message: 'Anda telah keluar.' });
    });
  });
}
