import { randomUUID } from 'node:crypto';
import { transaction, type Database, type Transaction } from '../../../../packages/database/src/database.js';
import type { AccountType, Registration, User } from '../../../../packages/contracts/src/auth.js';
import type { EmailProvider } from '../notifications/email.js';
import { ApiError, invalidCredentials, invalidSession, invalidToken } from '../core/errors.js';
import { authorize, requireUsableAccount, publicUser } from './authorization.js';
import { digest, hashPassword, newToken, verifyPassword } from './crypto.js';

import { EmailOutbox } from '../notifications/outbox.js';

const ACCESS_SECONDS = 15 * 60;
const SESSION_SECONDS = 30 * 24 * 60 * 60;
type Purpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';
interface ActionToken { user_id: string; purpose: Purpose; expires_at: Date; used_at: Date | null }
interface Session { id: string; user_id: string; expires_at: Date; revoked_at: Date | null }
const generic = { message: 'Jika permintaan memenuhi syarat, instruksi akan dikirim melalui email.' };

export class AuthService {
  private constructor(private db: Database, private outbox: EmailOutbox, private dummyHash: string) {}
  static async create(db: Database, email: EmailProvider, onEmailFailure = () => {}, encryptionKey?: string) {
    return new AuthService(db, new EmailOutbox(db, email, encryptionKey, onEmailFailure), await hashPassword(newToken()));
  }
  async flushEmails() { await this.outbox.flush(); }
  async notifySpaceReviewed(tx: Transaction, userId: string) {
    const user = (await tx.query('SELECT email FROM users WHERE id=$1',[userId])).rows[0];
    if (user) await this.outbox.enqueue(tx, { to: user.email, template: 'SPACE_REVIEWED' });
  }
  private async flushForTests() { if (process.env.NODE_ENV === 'test') await this.flushEmails(); }
  private async actionToken(tx: Transaction, userId: string, purpose: Purpose) {
    const token = newToken();
    await tx.query('UPDATE action_tokens SET used_at=now() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL', [userId, purpose]);
    await tx.query("INSERT INTO action_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')", [digest(token), userId, purpose, purpose === 'VERIFY_EMAIL' ? 86400 : 1800]);
    return token;
  }
  async register(input: Registration, type: AccountType) {
    // Hash on both existing and new-account paths; never update a duplicate account.
    const passwordHash = await hashPassword(input.password);
    await transaction(this.db, async tx => {
      for (const consent of input.consents) {
        const current = await tx.query('SELECT id FROM policies WHERE type=$1 AND version=$2 AND locale=$3 AND active AND effective_at<=now() FOR SHARE', [consent.type, consent.policyVersion, consent.locale]);
        if (!current.rowCount) throw new ApiError(409, 'POLICY_VERSION_CHANGED', 'Baca dan setujui kebijakan terbaru.', 'consents');
      }
      const userId = randomUUID();
      const result = await tx.query('INSERT INTO users(id,email,password_hash,account_type) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id', [userId,input.email,passwordHash,type]);
      if (!result.rowCount) return null;
      for (const consent of input.consents) {
        await tx.query("INSERT INTO consent_records(id,user_id,consent_type,policy_version,locale,status) VALUES($1,$2,$3,$4,$5,'ACCEPTED')", [randomUUID(),userId,consent.type,consent.policyVersion,consent.locale]);
      }
      const token = await this.actionToken(tx, userId, 'VERIFY_EMAIL');
      await this.outbox.enqueue(tx, { to: input.email, template: 'VERIFY_EMAIL', token });
    });
    await this.flushForTests();
    return generic;
  }
  async requestEmail(email: string, purpose: Purpose) {
    await transaction(this.db, async tx => {
      const user = (await tx.query<User>('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email])).rows[0];
      if (!user || user.deleted_at || ['SUSPENDED','DEACTIVATED','DELETED'].includes(user.status)) return null;
      if (purpose === 'VERIFY_EMAIL' && user.email_verified_at) return null;
      const token = await this.actionToken(tx,user.id,purpose);
      await this.outbox.enqueue(tx, { to: email, template: purpose, token });
    });
    await this.flushForTests();
    return generic;
  }
  private async consumeAction(tx: Transaction, raw: string, purpose: Purpose) {
    const hash = digest(raw);
    const candidate = (await tx.query<ActionToken>('SELECT * FROM action_tokens WHERE token_hash=$1 AND purpose=$2', [hash,purpose])).rows[0];
    if (!candidate) throw invalidToken();
    // All account mutations take the user lock first, then token/session locks.
    const user = (await tx.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id])).rows[0];
    if (!user) throw invalidToken();
    requireUsableAccount(user);
    const consumed = await tx.query('UPDATE action_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id', [hash]);
    if (!consumed.rowCount) {
      const expired = (await tx.query<{expired: boolean}>('SELECT expires_at<=now() AS expired FROM action_tokens WHERE token_hash=$1',[hash])).rows[0]?.expired;
      if (expired) throw new ApiError(400,'TOKEN_EXPIRED','Tautan sudah kedaluwarsa. Minta tautan baru.');
      throw invalidToken();
    }
    return user;
  }
  async verifyEmail(token: string) {
    await transaction(this.db, async tx => {
      const user = await this.consumeAction(tx,token,'VERIFY_EMAIL');
      await tx.query("UPDATE users SET email_verified_at=now(),status='ONBOARDING_INCOMPLETE',updated_at=now() WHERE id=$1 AND status='EMAIL_UNVERIFIED'", [user.id]);
    });
    return { message: 'Email terverifikasi. Masuk untuk melanjutkan.' };
  }
  private async issueSession(tx: Transaction, userId: string) {
    const accessToken = newToken(), refreshToken = newToken(), id = randomUUID();
    await tx.query("INSERT INTO sessions(id,user_id,access_hash,access_expires_at,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second',now()+$5*interval '1 second')", [id,userId,digest(accessToken),ACCESS_SECONDS,SESSION_SECONDS]);
    await tx.query('INSERT INTO refresh_tokens(token_hash,session_id) VALUES($1,$2)', [digest(refreshToken),id]);
    return { accessToken, refreshToken, expiresIn: ACCESS_SECONDS, tokenType: 'Bearer' };
  }
  async login(email: string, password: string) {
    const candidate = (await this.db.query<User>('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    const valid = await verifyPassword(password,candidate?.password_hash ?? this.dummyHash);
    if (!candidate || !valid) throw invalidCredentials();
    return transaction(this.db, async tx => {
      const user = (await tx.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.id])).rows[0];
      if (!user || user.password_hash !== candidate.password_hash) throw invalidCredentials();
      authorize(user,'self:read');
      return { ...(await this.issueSession(tx,user.id)), user: publicUser(user) };
    });
  }
  async authenticate(accessToken: string, executor: Database | Transaction = this.db) {
    const result = await executor.query<User & {session_id: string}>(`
      SELECT u.*,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.access_hash=$1 AND s.revoked_at IS NULL AND s.access_expires_at>now() AND s.expires_at>now()`, [digest(accessToken)]);
    const user = result.rows[0];
    if (!user) throw invalidSession();
    authorize(user,'self:read');
    return user;
  }
  async refresh(raw: string, existingTx?: Transaction) {
    const rotate = async (tx: Transaction) => {
      const candidate = (await tx.query<{session_id: string; user_id: string}>('SELECT r.session_id,s.user_id FROM refresh_tokens r JOIN sessions s ON s.id=r.session_id WHERE r.token_hash=$1', [digest(raw)])).rows[0];
      if (!candidate) return null;
      const user = (await tx.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id])).rows[0];
      if (!user) return null;
      authorize(user,'self:read');
      const session = (await tx.query<Session>('SELECT * FROM sessions WHERE id=$1 FOR UPDATE', [candidate.session_id])).rows[0];
      const refresh = (await tx.query<{used_at: Date | null}>('SELECT used_at FROM refresh_tokens WHERE token_hash=$1', [digest(raw)])).rows[0];
      if (!session || !refresh || session.revoked_at) return null;
      if (refresh.used_at || session.expires_at.getTime() <= Date.now()) {
        // Commit revocation BEFORE returning an error. Throwing here would roll it back.
        await tx.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [session.id]);
        return null;
      }
      const accessToken = newToken(), refreshToken = newToken();
      await tx.query('UPDATE refresh_tokens SET used_at=now() WHERE token_hash=$1', [digest(raw)]);
      await tx.query('INSERT INTO refresh_tokens(token_hash,session_id) VALUES($1,$2)', [digest(refreshToken),session.id]);
      await tx.query("UPDATE sessions SET access_hash=$1,access_expires_at=LEAST(expires_at,now()+$2*interval '1 second') WHERE id=$3", [digest(accessToken),ACCESS_SECONDS,session.id]);
      return { accessToken, refreshToken, expiresIn: Math.min(ACCESS_SECONDS,Math.max(0,Math.floor((session.expires_at.getTime()-Date.now())/1000))), tokenType: 'Bearer' };
    };
    const result = existingTx ? await rotate(existingTx) : await transaction(this.db, rotate);
    if (!result) throw invalidSession();
    return result;
  }
  async logout(accessToken: string) {
    // Idempotent, including expired access tokens; possession can only revoke its own session.
    await this.db.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE access_hash=$1', [digest(accessToken)]);
    return { message: 'Anda telah keluar.' };
  }
  async logoutWithRefresh(refreshToken: string) {
    // Can revoke a session without renewing it, including after app restart/access expiry.
    await this.db.query(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,now())
      WHERE id=(SELECT session_id FROM refresh_tokens WHERE token_hash=$1)`,[digest(refreshToken)]);
    return { message: 'Anda telah keluar.' };
  }
  /** Changes the password of a signed-in member and ends their other sessions. */
  async changePassword(userId: string, accessToken: string, current: string, next: string) {
    const row = (await this.db.query<{password_hash: string}>('SELECT password_hash FROM users WHERE id=$1',[userId])).rows[0];
    if (!row || !await verifyPassword(current,row.password_hash)) throw new ApiError(400,'CURRENT_PASSWORD_WRONG','Kata sandi saat ini salah.');
    const passwordHash = await hashPassword(next);
    await transaction(this.db, async tx => {
      const user = (await tx.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE',[userId])).rows[0]!;
      await tx.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[passwordHash,userId]);
      await tx.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1 AND access_hash<>$2',[userId,digest(accessToken)]);
      await this.outbox.enqueue(tx, { to: user.email, template: 'SECURITY_ALERT' });
    });
    await this.flushForTests();
    return { changed: true };
  }
  async revokeOtherSessions(userId: string, accessToken: string) {
    const result = await this.db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND access_hash<>$2 AND revoked_at IS NULL',[userId,digest(accessToken)]);
    return { revoked: result.rowCount ?? 0 };
  }
  async resetPassword(raw: string, password: string) {
    const passwordHash = await hashPassword(password);
    await transaction(this.db, async tx => {
      const user = await this.consumeAction(tx,raw,'RESET_PASSWORD');
      await tx.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [passwordHash,user.id]);
      await tx.query('UPDATE sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1', [user.id]);
      await tx.query("UPDATE action_tokens SET used_at=now() WHERE user_id=$1 AND purpose='RESET_PASSWORD' AND used_at IS NULL", [user.id]);
      await this.outbox.enqueue(tx, { to: user.email, template: 'SECURITY_ALERT' });
    });
    await this.flushForTests();
    return { message: 'Kata sandi diperbarui. Silakan masuk kembali.' };
  }
}
