import { z } from 'zod';
import { Pool } from '../../../packages/database/src/database.js';
import { buildApp } from './app.js';
import { DevelopmentEmailProvider } from './notifications/development-email.js';
import { SmtpEmailProvider } from './notifications/smtp-email.js';
import { HumanReviewSafetyClassifier } from './spaces/safety.js';

const secret = z.string().min(32);
const config = z.object({
  DATABASE_URL: z.string().url(), NODE_ENV: z.enum(['development','test','production']).default('development'),
  HOST: z.enum(['127.0.0.1','0.0.0.0']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  EMAIL_PROVIDER: z.enum(['development','smtp']),
  DEV_EMAIL_DIRECTORY: z.string().default('.local/mail'),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), EMAIL_FROM: z.string().optional(),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  BFF_SHARED_SECRET: secret.optional(), EMAIL_FLUSH_SECRET: secret.optional(),
  SAFETY_MODE: z.enum(['development','human-review']).default('development')
}).superRefine((c,ctx) => {
  const need = (ok: unknown,message: string) => { if (!ok) ctx.addIssue({ code: 'custom',message }); };
  if (c.EMAIL_PROVIDER === 'smtp') need(c.SMTP_HOST && c.SMTP_USER && c.SMTP_PASSWORD && c.EMAIL_FROM,'SMTP needs SMTP_HOST, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM');
  if (c.NODE_ENV === 'production') {
    need(c.EMAIL_PROVIDER === 'smtp','Production must send real email (EMAIL_PROVIDER=smtp)');
    need(c.SAFETY_MODE === 'human-review','Production needs SAFETY_MODE=human-review until a reviewed classifier exists');
    need(c.APP_BASE_URL.startsWith('https://'),'Production APP_BASE_URL must use HTTPS');
    need(c.BFF_SHARED_SECRET && c.EMAIL_FLUSH_SECRET,'Production needs BFF_SHARED_SECRET and EMAIL_FLUSH_SECRET');
  }
}).parse(process.env);

const production = config.NODE_ENV === 'production';
const db = new Pool({ connectionString: config.DATABASE_URL, max: production ? 5 : 10, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const email = config.EMAIL_PROVIDER === 'smtp'
  ? new SmtpEmailProvider({ host: config.SMTP_HOST!,port: config.SMTP_PORT,user: config.SMTP_USER!,password: config.SMTP_PASSWORD!,from: config.EMAIL_FROM! },config.APP_BASE_URL)
  : new DevelopmentEmailProvider(config.DEV_EMAIL_DIRECTORY,config.APP_BASE_URL);
const app = await buildApp({ db,email,logger: true,
  encryptionKey: config.DATA_ENCRYPTION_KEY,webOrigin: config.APP_BASE_URL,emailWorker: true,
  ...(config.SAFETY_MODE === 'human-review' ? { safety: new HumanReviewSafetyClassifier() } : {}),
  trustProxyHops: config.TRUST_PROXY_HOPS,
  ...(config.BFF_SHARED_SECRET ? { bffSecret: config.BFF_SHARED_SECRET } : {}),
  ...(config.EMAIL_FLUSH_SECRET ? { emailFlushSecret: config.EMAIL_FLUSH_SECRET } : {}) });
if (!production) app.log.warn({ event: 'development_mode', emailDelivery: config.EMAIL_PROVIDER, productionReady: false });
await app.listen({ host: config.HOST,port: config.PORT });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await app.close(); await db.end(); });
