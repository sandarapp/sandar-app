import { randomUUID } from 'node:crypto';
import { Pool, connection, transaction } from '../packages/database/src/database.js';

// Activates the public policy documents (hosted on the website) for one version.
// Members must accept the active Terms and Privacy Notice at sign-up and the
// Community Guidelines during onboarding, so run this only for reviewed text.
const args = new Set(process.argv.slice(2));
if (!args.has('--legal-approved')) throw new Error('Pass --legal-approved once a lawyer has reviewed this policy version.');
const site = new URL(process.env.SITE_URL ?? '');
const version = process.env.POLICY_VERSION ?? '';
if (site.protocol !== 'https:' || site.pathname !== '/' || site.search || site.hash) throw new Error('SITE_URL must be an https origin, e.g. https://hellosandar.com');
if (!/^[a-z0-9][a-z0-9.-]{2,79}$/.test(version)) throw new Error('POLICY_VERSION must match the version shown on the website, e.g. 2026-11-launch');
const pages = { TERMS: '/terms',PRIVACY_NOTICE: '/privacy',COMMUNITY_GUIDELINES: '/guidelines' } as const;

const db = new Pool(connection(process.env.DATABASE_URL ?? ''));
try {
  await transaction(db,async tx => {
    for (const [type,path] of Object.entries(pages)) for (const locale of ['en','id-ID']) {
      await tx.query('UPDATE policies SET active=false WHERE type=$1 AND locale=$2 AND active AND version<>$3',[type,locale,version]);
      await tx.query(`INSERT INTO policies(id,type,version,locale,effective_at,content_url,active) VALUES($1,$2,$3,$4,now(),$5,true)
        ON CONFLICT(type,version,locale) DO UPDATE SET content_url=EXCLUDED.content_url,active=true`,[randomUUID(),type,version,locale,new URL(path,site).toString()]);
    }
  });
  console.log(`Policies ${version} active for en and id-ID, served from ${site.origin}.`);
} finally { await db.end(); }
