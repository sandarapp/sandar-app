import { randomUUID } from 'node:crypto';
import { Pool, transaction } from '../packages/database/src/database.js';
if (process.env.NODE_ENV !== 'development') throw new Error('Auth policy fixtures are development-only');
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Seed requires a local development database');
const base = new URL(process.env.APP_BASE_URL ?? 'http://localhost:3000');
const db = new Pool({ connectionString: url.toString() });
try {
  await transaction(db,async tx => {
    for (const [type,path] of [['TERMS','terms'],['PRIVACY_NOTICE','privacy']]) {
      // Never replace an existing active policy or invent legal approval.
      const current = await tx.query('SELECT 1 FROM policies WHERE type=$1 AND locale=$2 AND active',[type,'id-ID']);
      if (!current.rowCount) await tx.query(`INSERT INTO policies(id,type,version,locale,effective_at,content_url,active)
        VALUES($1,$2,'dev-epic1-v1','id-ID',now(),$3,true) ON CONFLICT(type,version,locale) DO NOTHING`,[randomUUID(),type,new URL(`/legal/${path}`,base).toString()]);
    }
  });
  console.log('Development-only policy fixtures ready. No users or production legal policies created.');
} finally { await db.end(); }
