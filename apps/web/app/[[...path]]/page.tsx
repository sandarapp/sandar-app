import { notFound } from 'next/navigation';
import { AuthPanel } from '../auth-panel';
import { MemberApp, type MemberRoute } from '../member/member-app';
import type { AuthScreen } from '../../../../packages/auth-client/src/links';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function memberRoute(parts: string[]): MemberRoute | null {
  if (parts.length === 1 && (parts[0] === 'onboarding' || parts[0] === 'home' || parts[0] === 'discover' || parts[0] === 'profile')) return { name: parts[0] };
  if (parts.length === 2 && parts[0] === 'spaces' && uuid.test(parts[1]!)) return { name: 'space',id: parts[1]! };
  return null;
}
export default async function Page({ params }: {params: Promise<{path?: string[]}>}) {
  const parts = (await params).path ?? [];
  const member = memberRoute(parts);
  if (member) return <MemberApp key={parts.join('/')} route={member}/>;
  const path = parts.join('/') || 'login';
  const screens: AuthScreen[] = ['login','register','check-email','verify-email','forgot-password','reset-password','account'];
  if (!screens.includes(path as AuthScreen)) notFound();
  return <AuthPanel initialScreen={path as AuthScreen}/>;
}
