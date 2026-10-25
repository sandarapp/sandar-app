'use client';
import { ClientError, Transport, WebMemberClient, type RequestOptions } from '../../../../packages/auth-client/src/client';

let shared: WebMemberClient | null = null;
/** One client per tab. It talks only to the same-origin BFF; no tokens in the browser. */
export function memberClient() {
  shared ??= new WebMemberClient(new Transport('/api/v1',{ web: true,online: () => navigator.onLine }));
  return shared;
}

let locale = 'id-ID';
/** API locale for member requests; follows the interface language. */
export function setApiLocale(value: string) { locale = value; }

/** Member request in the interface language. A dead session sends the person back to log in. */
export async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try { return await memberClient().memberRequest<T>(path,{ locale,...options }); }
  catch (error) {
    if (error instanceof ClientError && error.status === 401) window.location.assign('/login');
    throw error;
  }
}

export function codeOf(error: unknown) { return error instanceof ClientError ? error.code : 'SERVER_ERROR'; }

// A search typed in the top bar travels to Discover in this tab only, never in the URL.
const SEARCH_KEY = 'sandar_search';
export function handOffSearch(q: string) { try { sessionStorage.setItem(SEARCH_KEY,q); } catch { /* Discover just opens empty. */ } }
export function takeSearch() {
  try { const q = sessionStorage.getItem(SEARCH_KEY) ?? '';sessionStorage.removeItem(SEARCH_KEY);return q; } catch { return ''; }
}
