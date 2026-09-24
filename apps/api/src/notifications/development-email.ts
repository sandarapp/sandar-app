import { mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EmailMessage, EmailProvider } from './email.js';
import { renderEmail } from './templates.js';

/** Local-only delivery sink. Same message ID overwrites the same file after a retry. */
export class DevelopmentEmailProvider implements EmailProvider {
  constructor(private directory: string, private appBaseUrl: string) {
    if (process.env.NODE_ENV === 'production') throw new Error('Development email is forbidden in production');
  }
  async send(message: EmailMessage) {
    const id = message.id ?? randomUUID();
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid delivery ID');
    const rendered = renderEmail(message, this.appBaseUrl);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const file = resolve(this.directory, `${id}.json`);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ id, to: message.to, template: message.template, ...rendered, deliveredAt: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  }
}
