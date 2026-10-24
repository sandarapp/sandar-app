import { Pool, connection } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new Pool(connection(process.env.DATABASE_URL));
try { await migrate(db); } finally { await db.end(); }
