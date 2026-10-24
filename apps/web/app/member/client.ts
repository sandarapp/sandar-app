'use client';
import { ClientError, Transport, WebMemberClient, type RequestOptions } from '../../../../packages/auth-client/src/client';

let shared: WebMemberClient | null = null;
/** One client per tab. It talks only to the same-origin BFF; no tokens in the browser. */
export function memberClient() {
  shared ??= new WebMemberClient(new Transport('/api/v1',{ web: true,online: () => navigator.onLine }));
  return shared;
}

/** Member request in Indonesian. A dead session sends the person back to log in. */
export async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try { return await memberClient().memberRequest<T>(path,{ locale: 'id-ID',...options }); }
  catch (error) {
    if (error instanceof ClientError && error.status === 401) window.location.assign('/login');
    throw error;
  }
}

export function codeOf(error: unknown) { return error instanceof ClientError ? error.code : 'SERVER_ERROR'; }
