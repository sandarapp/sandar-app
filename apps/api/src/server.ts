import { z } from 'zod';
import { Pool } from '../../../packages/database/src/database.js';
import { buildApp } from './app.js';
import { DevelopmentEmailProvider } from './notifications/development-email.js';
const config = z.object({
  DATABASE_URL: z.string().url(), NODE_ENV: z.enum(['development','test']).default('development'),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  EMAIL_PROVIDER: z.literal('development'),
  DEV_EMAIL_DIRECTORY: z.string().default('.local/mail'),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/)
}).parse(process.env);
const db = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const app = await buildApp({ db,email: new DevelopmentEmailProvider(config.DEV_EMAIL_DIRECTORY,config.APP_BASE_URL),logger: true,
  encryptionKey: config.DATA_ENCRYPTION_KEY,webOrigin: config.APP_BASE_URL,emailWorker: true });
app.log.warn({ event: 'prototype_mode', emailDelivery: 'local_development_inbox', productionReady: false });
await app.listen({ host: config.HOST,port: config.PORT });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await app.close(); await db.end(); });
