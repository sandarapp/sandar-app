import type { NextRequest } from 'next/server';
const routes: Record<string,string> = {
  policies: 'GET', 'auth/register/member': 'POST', 'auth/register/community': 'POST',
  'auth/email/verify': 'POST', 'auth/email/resend': 'POST', 'auth/password/forgot': 'POST', 'auth/password/reset': 'POST',
  'web/auth/login': 'POST', 'web/auth/session': 'GET', 'web/auth/logout': 'POST'
};
const failure = (status: number,code: string,message: string) => Response.json({ data: null,error: { code,message,field: null } },{ status,headers: { 'cache-control': 'no-store' } });
async function proxy(request: NextRequest, context: {params: Promise<{path: string[]}>}) {
  const path = (await context.params).path.join('/');
  if (routes[path] !== request.method || request.nextUrl.search) return failure(404,'NOT_FOUND','Halaman tidak ditemukan.');
  const origin = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  if (request.headers.get('x-sandar-client') !== 'web') return failure(403,'CSRF_REJECTED','Permintaan tidak diizinkan.');
  if (request.method !== 'GET' && request.headers.get('origin') !== origin) return failure(403,'CSRF_REJECTED','Permintaan tidak diizinkan.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return failure(403,'CSRF_REJECTED','Permintaan tidak diizinkan.');
  let body: string | undefined;
  if (request.method === 'POST') {
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
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'}/v1/${path}`, {
      method: request.method,body,cache: 'no-store',signal: AbortSignal.timeout(8000),
      headers: { 'content-type': 'application/json',origin,'x-sandar-client': 'web', ...(path.startsWith('web/') ? { cookie: request.headers.get('cookie') ?? '' } : {}) }
    });
    const headers = new Headers({ 'content-type': 'application/json','cache-control': 'no-store' });
    for (const name of ['set-cookie','retry-after','x-request-id']) { const value = response.headers.get(name);if (value) headers.set(name,value); }
    return new Response(await response.text(),{ status: response.status,headers });
  } catch { return failure(503,'SERVER_UNAVAILABLE','Layanan belum dapat dihubungi. Coba lagi nanti.'); }
}
export const GET = proxy;
export const POST = proxy;
