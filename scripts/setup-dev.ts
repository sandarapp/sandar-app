import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
let content: string;
try { content = await readFile('.env','utf8'); } catch { content = await readFile('.env.example','utf8'); }
if (!/^DATA_ENCRYPTION_KEY=[a-f0-9]{64}$/mi.test(content)) {
  const line = `DATA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`;
  content = /^DATA_ENCRYPTION_KEY=.*$/m.test(content) ? content.replace(/^DATA_ENCRYPTION_KEY=.*$/m,line) : `${content}\n${line}\n`;
}
await writeFile('.env',content,{ mode: 0o600 });await chmod('.env',0o600);
console.log('Development .env prepared. Configure local database URLs, then run db:migrate and db:seed. Secrets were not printed.');
