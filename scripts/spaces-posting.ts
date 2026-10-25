import { Pool, connection } from '../packages/database/src/database.js';

// Opens or closes member posting in every official Sandar space. Comments
// stay closed either way. Opening needs at least one moderator, because every
// member post waits for human review.
// Usage: npm run spaces:posting -- --open | --close
const open = process.argv.includes('--open'), close = process.argv.includes('--close');
if (open === close) throw new Error('Choose one: npm run spaces:posting -- --open | --close');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new Pool(connection(process.env.DATABASE_URL));
try {
  if (open && !(await db.query("SELECT 1 FROM staff_roles WHERE role='MODERATOR'")).rowCount) throw new Error('Grant a moderator first (npm run moderation:grant -- <email>)');
  const result = await db.query("UPDATE support_spaces SET posting_enabled=$1,updated_at=now() WHERE kind='OFFICIAL_SANDAR'", [open]);
  console.log(`${open ? 'Opened' : 'Closed'} posting in ${result.rowCount} official spaces.`);
} finally { await db.end(); }
