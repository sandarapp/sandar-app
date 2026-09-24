import { notFound } from 'next/navigation';
import { AuthPanel } from '../auth-panel';
import type { AuthScreen } from '../../../../packages/auth-client/src/links';
export default async function Page({ params }: {params: Promise<{path?: string[]}>}) {
  const path = (await params).path?.join('/') ?? 'login';
  const screens: AuthScreen[] = ['login','register','check-email','verify-email','forgot-password','reset-password','account'];
  if (!screens.includes(path as AuthScreen)) notFound();
  return <AuthPanel initialScreen={path as AuthScreen}/>;
}
