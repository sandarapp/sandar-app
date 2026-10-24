import pg from 'pg';
export const { Pool } = pg;
export type Database = pg.Pool;
export type Transaction = pg.PoolClient;

// Pool settings for a connection string. With DATABASE_CA_CERT (a PEM, e.g.
// Supabase's prod-ca-2021.crt) the server certificate is verified against that
// CA. SSL settings in the URL are dropped then, because pg lets them override
// the ssl option.
export function connection(connectionString: string, ca = process.env.DATABASE_CA_CERT) {
  if (!ca) return { connectionString };
  const pem = ca.replace(/\\n/g, '\n');
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) throw new Error('DATABASE_CA_CERT must be a PEM certificate');
  const url = new URL(connectionString);
  for (const key of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { ca: pem, rejectUnauthorized: true } };
}

export async function transaction<T>(db: Database, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    const result = await fn(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally { tx.release(); }
}
