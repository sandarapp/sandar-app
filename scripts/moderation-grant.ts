import { Pool, connection } from '../packages/database/src/database.js';

// Grants or revokes the moderator role for an existing member account.
// Usage: npm run moderation:grant -- <email> [--revoke]
const args = process.argv.slice(2);
const email = args.find(a => !a.startsWith('--'))?.trim().toLowerCase();
const revoke = args.includes('--revoke');
if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('Give the account email: npm run moderation:grant -- <email> [--revoke]');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new Pool(connection(process.env.DATABASE_URL));
try {
  const user = (await db.query("SELECT id,account_type FROM users WHERE email=$1 AND deleted_at IS NULL", [email])).rows[0];
  if (!user) throw new Error('No account with that email');
  if (user.account_type !== 'MEMBER') throw new Error('Moderators use a member account');
  if (revoke) await db.query('DELETE FROM staff_roles WHERE user_id=$1', [user.id]);
  else await db.query("INSERT INTO staff_roles(user_id,role) VALUES($1,'MODERATOR') ON CONFLICT(user_id) DO NOTHING", [user.id]);
  console.log(revoke ? 'Moderator role removed.' : 'Moderator role granted.');
} finally { await db.end(); }
