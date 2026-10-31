import { randomUUID } from 'node:crypto';
import type { Database } from '../../../../packages/database/src/database.js';
import type { EmailMessage, EmailProvider } from './email.js';

/** Staging only: nothing leaves the system. Testers read tokens and codes from staging_emails. */
export class StagingEmailProvider implements EmailProvider {
  constructor(private db: Database, appBaseUrl: string) {
    if (/hellosandar\.com/.test(new URL(appBaseUrl).hostname)) throw new Error('Staging email is forbidden on the live domains');
  }
  async send(message: EmailMessage) {
    await this.db.query('INSERT INTO staging_emails(id,recipient,template,token,code) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
      [message.id ?? randomUUID(),message.to,message.template,message.token ?? null,message.code ?? null]);
  }
}
