import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction, type Database, type Transaction } from '../../../../packages/database/src/database.js';
import { SecretBox } from '../core/encryption.js';
import { digest } from '../auth/crypto.js';
import type { EmailMessage, EmailProvider } from './email.js';

const testKey = randomBytes(32).toString('hex');
const messageSchema = z.object({ to: z.string().email(), template: z.enum(['VERIFY_EMAIL','RESET_PASSWORD','SECURITY_ALERT','SPACE_REVIEWED']), token: z.string().optional() });
export class EmailOutbox {
  private box: SecretBox;
  constructor(private db: Database, private provider: EmailProvider, key: string | undefined, private onFailure = () => {}) {
    if (!key && process.env.NODE_ENV !== 'test') throw new Error('DATA_ENCRYPTION_KEY is required');
    this.box = new SecretBox(key ?? testKey);
  }
  async enqueue(tx: Transaction, message: EmailMessage) {
    const id = randomUUID();
    await tx.query(`INSERT INTO email_outbox(id,payload_encrypted,token_hash,expires_at)
      VALUES($1,$2,$3,now()+$4*interval '1 second')`, [id,this.box.seal(message,`email:${id}`),message.token ? digest(message.token) : null,message.template === 'RESET_PASSWORD' ? 1800 : 86400]);
  }
  async flush(limit = 20) {
    for (let n = 0; n < limit; n++) {
      const found = await transaction(this.db, async tx => {
        const row = (await tx.query<{id: string; payload_encrypted: string; token_hash: string | null; expired: boolean; attempts: number}>(`
          SELECT *, expires_at<=now() AS expired FROM email_outbox
          WHERE status='PENDING' AND next_attempt_at<=now() ORDER BY created_at
          LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
        if (!row) return false;
        const token = row.token_hash ? (await tx.query('SELECT 1 FROM action_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()', [row.token_hash])).rowCount : 1;
        if (row.expired || !token) {
          await tx.query("UPDATE email_outbox SET status='CANCELLED',payload_encrypted=NULL WHERE id=$1", [row.id]);
          return true;
        }
        try {
          const message = messageSchema.parse(this.box.open(row.payload_encrypted,`email:${row.id}`));
          await this.provider.send({ ...message, id: row.id });
          await tx.query("UPDATE email_outbox SET status='SENT',payload_encrypted=NULL,delivered_at=now(),attempts=attempts+1 WHERE id=$1", [row.id]);
        } catch {
          this.onFailure();
          await tx.query(`UPDATE email_outbox SET attempts=attempts+1,
            status=CASE WHEN attempts>=4 THEN 'FAILED' ELSE 'PENDING' END,
            payload_encrypted=CASE WHEN attempts>=4 THEN NULL ELSE payload_encrypted END,
            next_attempt_at=now()+LEAST(900,power(2,attempts+1)*10)*interval '1 second'
            WHERE id=$1`, [row.id]);
        }
        return true;
      });
      if (!found) break;
    }
  }
}
