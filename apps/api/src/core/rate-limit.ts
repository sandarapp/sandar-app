import type { Database } from '../../../../packages/database/src/database.js';
import { digest } from '../auth/crypto.js';
import { ApiError } from './errors.js';
export async function rateLimit(db: Database, key: string, max: number, seconds: number) {
  const result = await db.query<{attempts: number}>(`
    INSERT INTO rate_limits(key_hash, attempts, expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key_hash) DO UPDATE SET
      attempts = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.attempts+1 END,
      expires_at = CASE WHEN rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
    RETURNING attempts`, [digest(key), seconds]);
  if (result.rows[0]!.attempts > max) throw new ApiError(429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi nanti.');
}
