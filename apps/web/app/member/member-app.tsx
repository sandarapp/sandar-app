'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClientError } from '../../../../packages/auth-client/src/client';
import { resolveDestination } from '../../../../packages/auth-client/src/destination';
import type { Space } from '../../../../packages/contracts/src/spaces';
import { apiLocale, LangSwitch, useLang } from '../i18n';
import { call, handOffSearch, memberClient, setApiLocale } from './client';
import { HelpButton } from './help';
import { Onboarding } from './onboarding';
import { Home } from './home';
import { Discover } from './discover';
import { SpacePage } from './space';
import { Profile } from './profile';

export type MemberRoute = { name: 'onboarding' } | { name: 'home' } | { name: 'discover' } | { name: 'profile' } | { name: 'space'; id: string };

export function MemberApp({ route }: { route: MemberRoute }) {
  const { lang,t } = useLang();
  const [ready,setReady] = useState(false),[failed,setFailed] = useState(false);
  setApiLocale(apiLocale(lang));
  useEffect(() => {
    let active = true;
    // The server decides where this account may be; the URL is only a wish.
    resolveDestination(memberClient()).then(destination => {
      if (!active) return;
      if (destination.kind === 'member-onboarding') { if (route.name !== 'onboarding') return window.location.replace('/onboarding'); }
      else if (destination.kind === 'member-home') { if (route.name === 'onboarding') return window.location.replace('/home'); }
      else return window.location.replace('/account');
      setReady(true);
    }).catch(error => {
      if (!active) return;
      if (error instanceof ClientError && error.status === 401) window.location.replace('/login');
      else setFailed(true);
    });
    return () => { active = false; };
  },[route.name]);

  if (route.name === 'onboarding') return ready ? <Onboarding/> : <Bare failed={failed}/>;
  return <Shell route={route} ready={ready}>
    {failed ? <div className="empty"><h1 className="h serif">{t('shell.loadFail')}</h1><p className="p">{t('shell.loadFail.p')}</p><button className="btn" onClick={() => window.location.reload()}>{t('common.reload')}</button></div>
      : !ready ? <p className="loading" role="status">{t('common.loading')}</p>
      : <>
        {route.name === 'home' && <Home/>}
        {route.name === 'discover' && <Discover/>}
        {route.name === 'profile' && <Profile/>}
        {route.name === 'space' && <SpacePage id={route.id}/>}
      </>}
  </Shell>;
}

function Bare({ failed }: { failed: boolean }) {
  const { t } = useLang();
  return <main className="bare">{failed ? <div className="empty"><h1 className="h serif">{t('shell.loadFail')}</h1><p className="p">{t('shell.loadFail.p')}</p><button className="btn" onClick={() => window.location.reload()}>{t('common.reload')}</button></div> : <p className="loading" role="status">{t('common.loading')}</p>}</main>;
}

function Shell({ route,ready,children }: { route: MemberRoute; ready: boolean; children: React.ReactNode }) {
  const { t } = useLang();
  const [mine,setMine] = useState<Space[]>([]),[q,setQ] = useState('');
  useEffect(() => {
    if (!ready) return;
    call<Space[]>('/spaces').then(list => setMine(list.filter(s => s.membership === 'JOINED'))).catch(() => {});
  },[ready]);
  const nav = [
    { href: '/home',key: 'nav.home' as const,on: route.name === 'home' },
    { href: '/discover',key: 'nav.discover' as const,on: route.name === 'discover' },
    { href: '/profile',key: 'nav.profile' as const,on: route.name === 'profile' }
  ];
  const search = (event: React.FormEvent) => {
    event.preventDefault();
    handOffSearch(q.trim());
    window.location.assign('/discover');
  };
  return <div className="app">
    <header className="top">
      <Link href="/home" className="wordmark serif">Sandar</Link>
      {route.name !== 'discover' && <form className="top-search" role="search" onSubmit={search}><input className="search" type="search" aria-label={t('search.label')} placeholder={t('search.placeholder')} value={q} maxLength={100} onChange={e => setQ(e.target.value)}/></form>}
      <span className="grow"/>
      <LangSwitch/>
      <HelpButton/>
      <Link href="/profile" className="avatar" aria-label={t('nav.profile')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M4.5 20c1.4-3.6 4.3-5.4 7.5-5.4s6.1 1.8 7.5 5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></Link>
    </header>
    <div className="app-body">
      <nav className="rail" aria-label={t('nav.main')}>
        {nav.map(item => <Link key={item.href} href={item.href} className={item.on ? 'ri on' : 'ri'} aria-current={item.on ? 'page' : undefined}>{t(item.key)}</Link>)}
        {mine.length > 0 && <><p className="rail-group">{t('nav.mySpaces')}</p>{mine.map(s => {
          const on = route.name === 'space' && route.id === s.id;
          return <Link key={s.id} href={`/spaces/${s.id}`} className={on ? 'ri small on' : 'ri small'} aria-current={on ? 'page' : undefined}>{s.name}</Link>;
        })}</>}
        <p className="soon">{t('nav.soon')}</p>
      </nav>
      <main className="app-main">{children}</main>
    </div>
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      {nav.map(item => <Link key={item.href} href={item.href} className={item.on ? 'on' : ''} aria-current={item.on ? 'page' : undefined}><i aria-hidden="true"/>{t(item.key)}</Link>)}
    </nav>
  </div>;
}
