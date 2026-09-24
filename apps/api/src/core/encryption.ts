import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Versioned AES-GCM envelope; caller binds ciphertext to its purpose and record ID. */
export class SecretBox {
  private key: Buffer;
  constructor(keyHex: string) {
    if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error('DATA_ENCRYPTION_KEY must be 32 random bytes encoded as hex');
    this.key = Buffer.from(keyHex, 'hex');
  }
  seal(value: unknown, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const payload = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), payload.toString('base64url')].join('.');
  }
  open(value: string, context: string): unknown {
    const [version, iv, tag, payload] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !payload) throw new Error('Invalid encrypted envelope');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8'));
  }
}
