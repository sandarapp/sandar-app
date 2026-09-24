import Fastify, { LogController } from 'fastify';
import { readdir,readFile,mkdir,unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { escapeHtml } from '../apps/api/src/notifications/templates.js';
if (process.env.NODE_ENV !== 'development') throw new Error('Development inbox is forbidden outside development');
const directory = resolve(process.env.DEV_EMAIL_DIRECTORY ?? '.local/mail');
await mkdir(directory,{ recursive: true,mode: 0o700 });
const port = Number(process.env.DEV_INBOX_PORT ?? 8025);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid inbox port');
const app = Fastify({ logger: false,logController: new LogController({ disableRequestLogging: true }) });
app.addHook('onRequest',async (request,reply) => {
  reply.header('cache-control','no-store').header('referrer-policy','no-referrer').header('x-content-type-options','nosniff').header('cross-origin-resource-policy','same-origin').header('x-frame-options','DENY')
    .header('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (![`localhost:${port}`,`127.0.0.1:${port}`].includes(request.headers.host ?? '') || request.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send('Local development inbox only.');
});
const page = (body: string) => `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sandar · Development inbox</title><style>body{font:16px system-ui;background:#fff8f1;color:#512b26;max-width:800px;margin:40px auto;padding:24px}a{color:#a64433}article{border:1px solid #dfcfc3;border-radius:12px;padding:24px;margin:16px 0}small{color:#806e64}p{line-height:1.6}</style><h1>Sandar · Development inbox</h1><p>Local test emails only. Messages contain secret links. No email was sent to an external inbox. Messages are removed after 24 hours.</p>${body}</html>`;
type Delivery = {id: string;to: string;subject: string;template: string;text: string;link: string|null;deliveredAt: string};
async function messages() {
  const result: Delivery[] = [];
  for (const file of await readdir(directory)) {
    if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
    const message = JSON.parse(await readFile(resolve(directory,file),'utf8')) as Delivery;
    if (Date.parse(message.deliveredAt) < Date.now()-86400000) { await unlink(resolve(directory,file));continue; }
    result.push(message);
  }
  return result.sort((a,b) => b.deliveredAt.localeCompare(a.deliveredAt));
}
app.get('/',async (_request,reply) => reply.type('text/html').send(page((await messages()).map(m => `<article><small>${escapeHtml(m.deliveredAt)} · ${escapeHtml(m.to)}</small><h2><a href="/messages/${escapeHtml(m.id)}">${escapeHtml(m.subject)}</a></h2></article>`).join('') || '<p>No development emails yet. Register an account in the app, then reload.</p>')));
app.get('/messages/:id',async (request,reply) => {
  const id = (request.params as {id: string}).id;
  const message = (await messages()).find(m => m.id === id);
  if (!message) return reply.code(404).type('text/html').send(page('<p>Email not found or expired.</p>'));
  return reply.type('text/html').send(page(`<a href="/">← Inbox</a><article><small>To: ${escapeHtml(message.to)}</small><h2>${escapeHtml(message.subject)}</h2><p>${escapeHtml(message.text).replace(/\n/g,'<br>')}</p>${message.link ? `<a rel="noreferrer" href="${escapeHtml(message.link)}">Open secure action link</a>` : ''}</article>`));
});
app.setErrorHandler((_error,_request,reply) => reply.code(500).send('Development inbox could not load.'));
await app.listen({host:'127.0.0.1',port});
console.log(`Local development inbox: http://localhost:${port}`);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async () => { await app.close(); });
