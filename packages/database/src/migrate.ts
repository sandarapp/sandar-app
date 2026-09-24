import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { transaction, type Database } from './database.js';
export async function migrate(db: Database, directory = resolve('packages/database/migrations')) {
  await transaction(db, async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(72431001)');
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(directory)).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
      const sql = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const result = await tx.query<{checksum: string}>('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (result.rows[0]) {
        if (result.rows[0].checksum !== checksum) throw new Error(`Migration changed: ${name}`);
        continue;
      }
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name,checksum]);
    }
  });
}
