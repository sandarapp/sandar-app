import { Pool, connection } from '../packages/database/src/database.js';

// Opens or closes member posting, and optionally comments, in every official
// Sandar space. Posts and comments publish at once; self-harm language is held
// back by the phrase filter and members can report anything else.
// Usage: npm run spaces:posting -- --open | --close [--comments]
const open = process.argv.includes('--open'), close = process.argv.includes('--close'), comments = process.argv.includes('--comments');
if (open === close) throw new Error('Choose one: npm run spaces:posting -- --open | --close [--comments]');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new Pool(connection(process.env.DATABASE_URL));
try {
  const result = await db.query(`UPDATE support_spaces SET posting_enabled=$1${comments ? ',commenting_enabled=$1' : ''},updated_at=now() WHERE kind='OFFICIAL_SANDAR'`, [open]);
  console.log(`${open ? 'Opened' : 'Closed'} posting${comments ? ' and comments' : ''} in ${result.rowCount} official spaces.`);
} finally { await db.end(); }
