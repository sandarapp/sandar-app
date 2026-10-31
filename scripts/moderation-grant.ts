import { Pool, connection } from '../packages/database/src/database.js';

// Grants or revokes a staff role for an existing member account. This is how the
// first super admin gets in; after that, roles are managed in Sandar Ops.
// Usage: npm run moderation:grant -- <email> [--role MODERATOR|ADMIN|SUPER_ADMIN] [--revoke]
const args = process.argv.slice(2);
const email = args.find(a => a.includes('@'))?.trim().toLowerCase();
const revoke = args.includes('--revoke');
const role = args.includes('--role') ? args[args.indexOf('--role') + 1] : 'MODERATOR';
if (!['MODERATOR','ADMIN','SUPER_ADMIN'].includes(role ?? '')) throw new Error('Unknown role');
if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('Give the account email: npm run moderation:grant -- <email> [--role ROLE] [--revoke]');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new Pool(connection(process.env.DATABASE_URL));
try {
  const user = (await db.query("SELECT id,account_type FROM users WHERE email=$1 AND deleted_at IS NULL", [email])).rows[0];
  if (!user) throw new Error('No account with that email');
  if (user.account_type !== 'MEMBER') throw new Error('Moderators use a member account');
  if (revoke) await db.query('DELETE FROM staff_roles WHERE user_id=$1 AND role=$2', [user.id,role]);
  else await db.query('INSERT INTO staff_roles(user_id,role) VALUES($1,$2) ON CONFLICT(user_id,role) DO NOTHING', [user.id,role]);
  console.log(revoke ? `${role} removed.` : `${role} granted.`);
} finally { await db.end(); }
