export interface PublicUser { id: string; email: string; accountType: 'MEMBER' | 'COMMUNITY'; status: string; emailVerifiedAt: string | null }
export interface Policy { type: 'TERMS' | 'PRIVACY_NOTICE'; version: string; locale: string; contentUrl: string }
export class ClientError extends Error {
  constructor(public code: string, message: string, public status = 0, public retryAfter = 0, public field: string | null = null) { super(message); }
}
export interface TokenStore { get(): Promise<string | null>; set(value: string): Promise<void>; remove(): Promise<void> }
export interface RequestOptions { method?: 'GET' | 'POST'; body?: unknown; accessToken?: string }
export class Transport {
  constructor(private baseUrl: string, private options: { web?: boolean; fetcher?: typeof fetch; online?: () => boolean; timeoutMs?: number } = {}) {}
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (this.options.online?.() === false) throw new ClientError('OFFLINE','Anda sedang offline. Periksa koneksi lalu coba lagi.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),this.options.timeoutMs ?? 10000);
    try {
      const response = await (this.options.fetcher ?? fetch)(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET', signal: controller.signal, cache: 'no-store',
        credentials: this.options.web ? 'same-origin' : 'omit',
        headers: { ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}), ...(this.options.web ? { 'x-sandar-client': 'web' } : {}) },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        const status = response.status;
        const code = typeof data?.error?.code === 'string' ? data.error.code : 'SERVER_ERROR';
        const message = status >= 500 ? 'Layanan sedang bermasalah. Coba lagi nanti.' : typeof data?.error?.message === 'string' ? data.error.message : 'Permintaan tidak dapat diproses.';
        throw new ClientError(code,message,status,Math.min(3600,Math.max(0,Number(response.headers.get('retry-after')) || 0)),data?.error?.field ?? null);
      }
      if (!data || !Object.hasOwn(data,'data')) throw new ClientError('SERVER_ERROR','Respons layanan tidak valid.',502);
      return data.data as T;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      if (controller.signal.aborted) throw new ClientError('TIMEOUT','Permintaan terlalu lama. Periksa koneksi sebelum mencoba lagi.');
      throw new ClientError('NETWORK_ERROR','Tidak dapat terhubung. Periksa koneksi Anda.');
    } finally { clearTimeout(timer); }
  }
}
export interface AuthClient {
  policies(): Promise<Policy[]>;
  register(type: 'member' | 'community', body: unknown): Promise<unknown>;
  login(email: string,password: string): Promise<PublicUser>;
  session(): Promise<PublicUser>;
  logout(): Promise<void>;
  verify(token: string): Promise<unknown>;
  forgot(email: string): Promise<unknown>;
  resend(email: string): Promise<unknown>;
  reset(token: string,password: string): Promise<unknown>;
}
abstract class CommonAuth implements AuthClient {
  constructor(protected transport: Transport) {}
  policies() { return this.transport.request<Policy[]>('/policies'); }
  register(type: 'member' | 'community', body: unknown) { return this.transport.request(`/auth/register/${type}`,{ method: 'POST',body }); }
  verify(token: string) { return this.transport.request('/auth/email/verify',{ method: 'POST',body: { token } }); }
  forgot(email: string) { return this.transport.request('/auth/password/forgot',{ method: 'POST',body: { email } }); }
  resend(email: string) { return this.transport.request('/auth/email/resend',{ method: 'POST',body: { email } }); }
  reset(token: string,password: string) { return this.transport.request('/auth/password/reset',{ method: 'POST',body: { token,password } }); }
  abstract login(email: string,password: string): Promise<PublicUser>;
  abstract session(): Promise<PublicUser>;
  abstract logout(): Promise<void>;
}
export class WebAuthClient extends CommonAuth {
  login(email: string,password: string) { return this.transport.request<PublicUser>('/web/auth/login',{ method: 'POST',body: { email,password } }); }
  session() { return this.transport.request<PublicUser>('/web/auth/session'); }
  async logout() { await this.transport.request('/web/auth/logout',{ method: 'POST',body: {} }); }
}
type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };
export class NativeAuthClient extends CommonAuth {
  private accessToken: string | null = null;
  private refreshFlight: Promise<void> | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  constructor(transport: Transport, private store: TokenStore) { super(transport); }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const work = this.serial.then(fn,fn);
    this.serial = work.catch(() => {});
    return work;
  }
  private async save(tokens: Tokens) {
    try { await this.store.set(JSON.stringify({ refreshToken: tokens.refreshToken })); }
    catch { await this.transport.request('/auth/logout',{ method: 'POST',accessToken: tokens.accessToken }).catch(() => {}); throw new ClientError('SECURE_STORAGE_ERROR','Penyimpanan aman tidak tersedia. Masuk kembali setelah memperbaikinya.'); }
    this.accessToken = tokens.accessToken;
  }
  private async stored(): Promise<{refreshToken?: string; logoutAccessToken?: string; logoutRefreshToken?: string} | null> {
    try {
      const raw = await this.store.get();
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {refreshToken?: string; logoutAccessToken?: string; logoutRefreshToken?: string};
      if ((parsed.refreshToken && /^[A-Za-z0-9_-]{43}$/.test(parsed.refreshToken)) || (parsed.logoutAccessToken && /^[A-Za-z0-9_-]{43}$/.test(parsed.logoutAccessToken)) || (parsed.logoutRefreshToken && /^[A-Za-z0-9_-]{43}$/.test(parsed.logoutRefreshToken))) return parsed;
      await this.store.remove();
      return null;
    } catch { throw new ClientError('SECURE_STORAGE_ERROR','Tidak dapat membaca penyimpanan aman.'); }
  }
  async login(email: string,password: string) {
    return this.exclusive(async () => {
      // A pending offline logout must be reconciled before another login.
      const old = await this.stored();
      if (old?.logoutAccessToken || old?.logoutRefreshToken) {
        await this.transport.request('/auth/logout',{ method: 'POST',accessToken: old.logoutAccessToken,...(old.logoutRefreshToken ? {body:{refreshToken:old.logoutRefreshToken}} : {}) });
        await this.store.remove();
      }
      const tokens = await this.transport.request<Tokens & {user: PublicUser}>('/auth/login',{ method: 'POST',body: { email,password } });
      await this.save(tokens);
      return this.transport.request<PublicUser>('/users/me',{ accessToken: tokens.accessToken });
    });
  }
  private refresh() {
    if (this.refreshFlight) return this.refreshFlight;
    this.refreshFlight = this.exclusive(async () => {
      const saved = await this.stored();
      this.accessToken = null;
      if (saved?.logoutAccessToken || saved?.logoutRefreshToken) {
        await this.transport.request('/auth/logout',{ method: 'POST',accessToken: saved.logoutAccessToken,...(saved.logoutRefreshToken ? {body:{refreshToken:saved.logoutRefreshToken}} : {}) });
        await this.store.remove();
        throw new ClientError('SESSION_INVALID','Silakan masuk kembali.',401);
      }
      if (!saved?.refreshToken) throw new ClientError('SESSION_INVALID','Silakan masuk kembali.',401);
      // Consume locally BEFORE the request: a crash/ambiguous response must never replay it.
      await this.store.remove();
      const tokens = await this.transport.request<Tokens>('/auth/refresh',{ method: 'POST',body: { refreshToken: saved.refreshToken } });
      await this.save(tokens);
    }).finally(() => { this.refreshFlight = null; });
    return this.refreshFlight;
  }
  async session() {
    if (!this.accessToken) await this.refresh();
    const attempted = this.accessToken;
    try { return await this.transport.request<PublicUser>('/users/me',{ accessToken: attempted! }); }
    catch (error) {
      if (!(error instanceof ClientError) || error.status !== 401) throw error;
      // Another caller may already have refreshed since this request began.
      if (this.refreshFlight) await this.refreshFlight;
      else if (this.accessToken === attempted) await this.refresh();
      return this.transport.request<PublicUser>('/users/me',{ accessToken: this.accessToken! });
    }
  }
  async logout() {
    await this.refreshFlight;
    return this.exclusive(async () => {
      const saved = await this.stored();
      const token = this.accessToken ?? saved?.logoutAccessToken;
      const refreshToken = saved?.logoutRefreshToken ?? saved?.refreshToken;
      this.accessToken = null;
      if (!token && !refreshToken) { await this.store.remove(); return; }
      await this.store.set(JSON.stringify(token ? { logoutAccessToken: token } : { logoutRefreshToken: refreshToken }));
      try { await this.transport.request('/auth/logout',{ method: 'POST',accessToken: token ?? undefined,...(!token ? {body:{refreshToken}} : {}) }); await this.store.remove(); }
      catch { throw new ClientError('LOGOUT_PENDING','Anda keluar di perangkat ini. Pengakhiran sesi server menunggu koneksi; coba lagi saat online.'); }
    });
  }
}
