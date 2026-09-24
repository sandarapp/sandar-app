import { randomUUID } from 'node:crypto';
import { Pool,transaction } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { buildApp } from '../apps/api/src/app.js';
import { DevelopmentEmailProvider } from '../apps/api/src/notifications/development-email.js';
if (process.env.NODE_ENV !== 'test') throw new Error('E2E server requires NODE_ENV=test');
const url=new URL(process.env.E2E_DATABASE_URL??'');
if(!url.pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('E2E requires a disposable local _test database');
const db=new Pool({connectionString:url.toString(),max:10});
await migrate(db);
await transaction(db,async tx=>{
  await tx.query('TRUNCATE consent_records,refresh_tokens,sessions,action_tokens,users,policies,rate_limits CASCADE');
  for(const [type,path] of [['TERMS','terms'],['PRIVACY_NOTICE','privacy']])await tx.query("INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,'dev-epic1-v1','id-ID',now(),$3,true)",[randomUUID(),type,`http://localhost:3100/legal/${path}`]);
});
const key=process.env.DATA_ENCRYPTION_KEY;
if(!key)throw new Error('Test encryption key required');
const app=await buildApp({db,email:new DevelopmentEmailProvider(process.env.DEV_EMAIL_DIRECTORY??'.local/e2e-mail','http://localhost:3100'),encryptionKey:key,webOrigin:'http://localhost:3100'});
await app.listen({host:'127.0.0.1',port:3101});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();await db.end();});
