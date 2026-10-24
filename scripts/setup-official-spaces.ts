import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { Pool, connection, transaction } from '../packages/database/src/database.js';
import { discoveryTopics } from '../packages/contracts/src/discovery.js';

// Creates or updates the official Sandar spaces and their opening team posts
// from a reviewed content file. Posting stays closed (launch scope); running
// it again updates copy without duplicating posts.
const file = process.argv[2] ?? 'content/official-spaces.json';
const version = process.env.POLICY_VERSION ?? '';
if (!/^[a-z0-9][a-z0-9.-]{2,79}$/.test(version)) throw new Error('POLICY_VERSION must be the active Community Guidelines version, e.g. 2026-11-launch');
const content = z.object({ spaces: z.array(z.object({
  key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(3).max(80), purpose: z.string().min(10).max(300),
  audience: z.string().min(5).max(200), topic: z.string().min(2).max(60), topics: z.array(z.enum(discoveryTopics)).min(1),
  posts: z.array(z.string().min(10).max(1000)).max(10)
})).min(1) }).parse(JSON.parse(await readFile(file,'utf8')));

// Stable ids from the content keys keep reruns idempotent.
const stableId = (seed: string) => {
  const h = createHash('sha256').update(`sandar:${seed}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};
const db = new Pool(connection(process.env.DATABASE_URL ?? ''));
try {
  await transaction(db,async tx => {
    for (const space of content.spaces) {
      const id = stableId(`space:${space.key}`);
      await tx.query(`INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,development_sample,posting_enabled,commenting_enabled)
        VALUES($1,'OFFICIAL_SANDAR',$2,$3,$4,$5,'Sandar','ACTIVE',$6,false,false,false)
        ON CONFLICT(id) DO UPDATE SET name=$2,purpose=$3,audience=$4,topic=$5,guidelines_version=$6,updated_at=now()`,[id,space.name,space.purpose,space.audience,space.topic,version]);
      await tx.query(`INSERT INTO discovery_profiles(space_id,published,topics,participation,format) VALUES($1,true,$2,ARRAY['READ_QUIETLY'],'ONLINE')
        ON CONFLICT(space_id) DO UPDATE SET published=true,topics=$2`,[id,space.topics]);
      for (const [i,body] of space.posts.entries()) {
        const postId = stableId(`post:${space.key}:${i}`);
        await tx.query(`INSERT INTO space_posts(id,space_id,author_user_id,identity_mode,body,request_id,status) VALUES($1,$2,NULL,'ANNOUNCEMENT',$3,$1,'VISIBLE')
          ON CONFLICT(id) DO UPDATE SET body=$3`,[postId,id,body]);
      }
    }
  });
  console.log(`${content.spaces.length} official spaces ready. Posting and commenting stay closed.`);
} finally { await db.end(); }
