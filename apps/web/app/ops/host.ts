import { headers } from 'next/headers';
// Sandar Ops lives on its own subdomain when OPS_BASE_URL is set. The session
// cookie has no Domain, so a member sign-in never carries over to it. Without
// OPS_BASE_URL (local work) Ops is served at /ops on the one host.
export const opsHostname = () => { const url = process.env.OPS_BASE_URL;return url ? new URL(url).host : null; };
export const isOpsHost = (host: string | null,forwarded: string | null) => { const ops = opsHostname();return Boolean(ops && (host === ops || forwarded === ops)); };
export async function hostKind(): Promise<'ops' | 'app' | 'single'> {
  if (!opsHostname()) return 'single';
  const h = await headers();
  return isOpsHost(h.get('host'),h.get('x-forwarded-host')) ? 'ops' : 'app';
}
