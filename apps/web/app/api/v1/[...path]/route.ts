import type { NextRequest } from 'next/server';
import { memberRouteAllowed } from '../../../../../../packages/contracts/src/web-member';
const routes: Record<string,string> = {
  policies: 'GET', 'auth/register/member': 'POST', 'auth/register/community': 'POST',
  'auth/email/verify': 'POST', 'auth/email/resend': 'POST', 'auth/password/forgot': 'POST', 'auth/password/reset': 'POST',
  'web/auth/login': 'POST', 'web/auth/session': 'GET', 'web/auth/logout': 'POST'
};
// Only the city directory takes a query string: one country, at most one search term.
function queryAllowed(path: string, search: URLSearchParams) {
  if (![...search.keys()].length) return true;
  return path === 'web/member/locations/cities' && [...search.keys()].every(key => key === 'country' || key === 'q')
    && search.getAll('country').length === 1 && search.getAll('q').length <= 1;
}
function allowed(method: string, path: string) {
  if (path.startsWith('web/member/')) return memberRouteAllowed(method,path.slice('web/member/'.length));
  return routes[path] === method;
}
// The hosting proxy appends the connecting visitor's address last in X-Forwarded-For.
function visitorIp(request: NextRequest) {
  const chain = request.headers.get('x-forwarded-for')?.split(',').map(part => part.trim()).filter(Boolean);
  return chain?.at(-1) ?? null;
}
const failure = (status: number,code: string,message: string) => Response.json({ data: null,error: { code,message,field: null } },{ status,headers: { 'cache-control': 'no-store' } });
async function proxy(request: NextRequest, context: {params: Promise<{path: string[]}>}) {
  const path = (await context.params).path.join('/');
  if (!allowed(request.method,path) || !queryAllowed(path,request.nextUrl.searchParams)) return failure(404,'NOT_FOUND','Halaman tidak ditemukan.');
  const origin = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  if (request.headers.get('x-sandar-client') !== 'web') return failure(403,'CSRF_REJECTED','Permintaan tidak diizinkan.');
  if (request.method !== 'GET' && request.headers.get('origin') !== origin) return failure(403,'CSRF_REJECTED','Permintaan tidak diizinkan.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return failure(403,'CSRF_REJECTED','Permintaan tidak diizinkan.');
  let body: string | undefined;
  if (request.method === 'POST' || request.method === 'PATCH') {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return failure(415,'JSON_REQUIRED','Gunakan JSON.');
    const reader = request.body?.getReader();
    const parts: Uint8Array[] = [];let size = 0;
    if (reader) while (true) {
      const chunk = await reader.read();if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) { await reader.cancel();return failure(413,'INVALID_REQUEST','Permintaan terlalu besar.'); }
      parts.push(chunk.value);
    }
    body = Buffer.concat(parts).toString('utf8');
  }
  const language = request.headers.get('accept-language');
  const secret = process.env.BFF_SHARED_SECRET, ip = visitorIp(request);
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'}/v1/${path}${request.nextUrl.search}`, {
      method: request.method,body,cache: 'no-store',signal: AbortSignal.timeout(8000),
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(language === 'en' || language === 'id-ID' ? { 'accept-language': language } : {}),
        origin,'x-sandar-client': 'web', ...(path.startsWith('web/') ? { cookie: request.headers.get('cookie') ?? '' } : {}),
        ...(secret && ip ? { 'x-sandar-bff': secret,'x-sandar-client-ip': ip } : {})
      }
    });
    const headers = new Headers({ 'content-type': 'application/json','cache-control': 'no-store' });
    for (const name of ['set-cookie','retry-after','x-request-id']) { const value = response.headers.get(name);if (value) headers.set(name,value); }
    return new Response(await response.text(),{ status: response.status,headers });
  } catch { return failure(503,'SERVER_UNAVAILABLE','Layanan belum dapat dihubungi. Coba lagi nanti.'); }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
