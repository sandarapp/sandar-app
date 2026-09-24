import pg from 'pg';
export const { Pool } = pg;
export type Database = pg.Pool;
export type Transaction = pg.PoolClient;
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
