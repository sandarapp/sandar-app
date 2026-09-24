export type AuthScreen = 'login' | 'register' | 'check-email' | 'verify-email' | 'forgot-password' | 'reset-password' | 'account';
export type AuthLink = { screen: 'verify-email' | 'reset-password'; token: string };
export function parseAuthLink(raw: string, webOrigin: string): AuthLink | null {
  try {
    const url = new URL(raw);
    const native = url.protocol === 'sandar:';
    if (!native && url.origin !== new URL(webOrigin).origin) return null;
    if (url.username || url.password || url.search) return null;
    const route = native ? url.hostname : url.pathname.slice(1);
    if (native && url.pathname && url.pathname !== '/') return null;
    if (route !== 'verify-email' && route !== 'reset-password') return null;
    const params = new URLSearchParams(url.hash.slice(1));
    if ([...params.keys()].length !== 1 || params.getAll('token').length !== 1) return null;
    const token = params.get('token');
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return { screen: route, token };
  } catch { return null; }
}
/** Only the implemented authenticated destination can be resumed. No open redirects. */
export function safeReturnPath(raw: string | null | undefined) { return raw === '/account' ? raw : '/account'; }
