import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hashPassword } from '../apps/api/src/auth/crypto.js';
import { Pool, connection } from '../packages/database/src/database.js';

// Prepares a staging database for automation practice: schema, official spaces,
// sample content, test accounts and a read-only database login. Safe to rerun; it
// keeps the passwords it made. Secrets go to .local/ only, never to the repo.
// Usage: tsx --env-file=.env.staging scripts/seed-staging.ts
const LIVE = ['vetxtphufjelxdbrvgts','kreqktykgbfywoskwsxn'];
const url = process.env.DATABASE_URL ?? '', base = process.env.APP_BASE_URL ?? '';
if (!url || !base) throw new Error('DATABASE_URL and APP_BASE_URL are required');
if (LIVE.some(ref => url.includes(ref))) throw new Error('This is a live database. Staging setup refuses to run on it.');
if (/hellosandar\.com/.test(new URL(base).hostname)) throw new Error('APP_BASE_URL is a live address. Staging setup refuses to run on it.');

const VERSION = 'staging-v1';
const secret = () => `${randomBytes(15).toString('base64url')}Aa1!`;
const accounts = [
  { key: 'member',email: 'qa.ana@sandar-staging.test',name: 'Ana QA',onboarded: true },
  { key: 'member2',email: 'qa.budi@sandar-staging.test',name: 'Budi QA',onboarded: true },
  { key: 'newMember',email: 'qa.baru@sandar-staging.test',name: 'Baru QA',onboarded: false },
  { key: 'moderator',email: 'qa.moderator@sandar-staging.test',name: 'Moderator QA',onboarded: true,role: 'MODERATOR' },
  { key: 'admin',email: 'qa.admin@sandar-staging.test',name: 'Admin QA',onboarded: true,role: 'SUPER_ADMIN' }
];
mkdirSync('.local',{ recursive: true });
const store = '.local/staging-secrets.json';
const secrets: Record<string,string> = existsSync(store) ? JSON.parse(readFileSync(store,'utf8')) : {};
for (const key of [...accounts.map(a => a.key),'database']) secrets[key] ??= secret().replace('!','');
writeFileSync(store,JSON.stringify(secrets,null,2),{ mode: 0o600 });

const run = (script: string,...args: string[]) => execFileSync('npx',['tsx',script,...args],{ stdio: 'inherit',env: { ...process.env,POLICY_VERSION: VERSION } });
run('scripts/migrate.ts');

const db = new Pool(connection(url));
try {
  for (const type of ['TERMS','PRIVACY_NOTICE','COMMUNITY_GUIDELINES']) for (const locale of ['en','id-ID']) {
    await db.query(`INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,$3,$4,now(),$5,true)
      ON CONFLICT(type,version,locale) DO UPDATE SET active=true`,[randomUUID(),type,VERSION,locale,new URL('/legal/terms',base).toString()]);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS staging_emails(id uuid PRIMARY KEY,recipient text NOT NULL,template text NOT NULL,token text,code text,created_at timestamptz NOT NULL DEFAULT now())`);
  run('scripts/setup-official-spaces.ts');
  run('scripts/spaces-posting.ts','--open','--comments');

  const ids: Record<string,string> = {};
  for (const a of accounts) {
    const id = (await db.query(`INSERT INTO users(id,email,password_hash,account_type,status,email_verified_at) VALUES($1,$2,$3,'MEMBER','ACTIVE',now())
      ON CONFLICT(email) DO UPDATE SET password_hash=$3,status='ACTIVE' RETURNING id`,[randomUUID(),a.email,await hashPassword(secrets[a.key]!)])).rows[0].id as string;
    ids[a.key] = id;
    await db.query(`INSERT INTO member_profiles(user_id,display_name,onboarding_completed_at,age_confirmed_at,boundaries_version,boundaries_locale) VALUES($1,$2,${a.onboarded ? 'now()' : 'NULL'},${a.onboarded ? 'now()' : 'NULL'},$3,$4)
      ON CONFLICT(user_id) DO UPDATE SET display_name=$2`,[id,a.name,a.onboarded ? VERSION : null,a.onboarded ? 'id-ID' : null]);
    if (a.role) await db.query('INSERT INTO staff_roles(user_id,role) VALUES($1,$2) ON CONFLICT(user_id,role) DO NOTHING',[id,a.role]);
  }
  const spaces = (await db.query("SELECT id,guidelines_version FROM support_spaces WHERE kind='OFFICIAL_SANDAR' ORDER BY created_at,id LIMIT 3")).rows;
  for (const s of spaces.slice(0,2)) for (const who of ['member','member2']) await db.query(`INSERT INTO space_memberships(space_id,user_id,status,guidelines_version) VALUES($1,$2,'JOINED',$3)
    ON CONFLICT(space_id,user_id) DO UPDATE SET status='JOINED'`,[s.id,ids[who],s.guidelines_version]);
  const samples: [string,'PROFILE'|'ANONYMOUS',string][] = [['member2','PROFILE','Sudah 3 minggu aku coba istirahat makan siang yang benar.'],['member2','ANONYMOUS','Ada yang punya cara biar nggak kepikiran kerjaan pas malam?'],['member','PROFILE','Hari ini cukup berat, tapi aku sudah makan siang.']];
  if (!(await db.query('SELECT 1 FROM space_posts WHERE author_user_id=$1 LIMIT 1',[ids.member2])).rowCount) {
    for (const [who,mode,body] of samples) await db.query(`INSERT INTO space_posts(id,space_id,author_user_id,identity_mode,body,request_id) VALUES($1,$2,$3,$4,$5,$1)`,[randomUUID(),spaces[0].id,ids[who],mode,body]);
  }

  // Reads everything, changes nothing, except clearing rate limits between test runs.
  const role = 'sandar_qa';
  const exists = (await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount;
  await db.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} LOGIN BYPASSRLS PASSWORD '${secrets.database}'`);
  await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await db.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
  await db.query(`GRANT DELETE ON rate_limits TO ${role}`);

  const u = new URL(url), project = u.username.includes('.') ? u.username.split('.')[1] : '';
  const dbUser = project ? `${role}.${project}` : role, dbName = u.pathname.slice(1);
  const lines = [`# Sandar staging: test credentials. Never commit or share publicly.`,'',`App: ${base}`,`Ops: ${base}/ops`,'','## Accounts',...accounts.map(a => `- ${a.key}: ${a.email} / ${secrets[a.key]}${'role' in a && a.role ? ` (${a.role})` : ''}${a.onboarded ? '' : ' (not onboarded)'}`),'','## Database (read-only)',`Host: ${u.hostname}`,`Port: ${u.port || 5432}`,`Database: ${dbName}`,`User: ${dbUser}`,`Password: ${secrets.database}`,`URL: postgresql://${dbUser}:${secrets.database}@${u.hostname}:${u.port || 5432}/${dbName}?sslmode=require`,''];
  writeFileSync('.local/staging-credentials.md',lines.join('\n'),{ mode: 0o600 });
  const values: [string,string,boolean][] = [['baseUrl',base,false],...accounts.flatMap((a): [string,string,boolean][] => [[`${a.key}Email`,a.email,false],[`${a.key}Password`,secrets[a.key]!,true]]),['opsCode','',false]];
  writeFileSync('.local/sandar-staging.postman_environment.json',JSON.stringify({ name: 'Sandar Staging',values: values.map(([key,value,hidden]) => ({ key,value,type: hidden ? 'secret' : 'default',enabled: true })),_postman_variable_scope: 'environment' },null,2),{ mode: 0o600 });
  console.log('Staging ready. Credentials: .local/staging-credentials.md  Postman environment: .local/sandar-staging.postman_environment.json');
} finally { await db.end(); }
