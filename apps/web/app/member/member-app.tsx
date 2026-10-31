'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ClientError } from '../../../../packages/auth-client/src/client';
import { resolveDestination } from '../../../../packages/auth-client/src/destination';
import type { HomeData } from '../../../../packages/contracts/src/home';
import type { MemberNotification } from '../../../../packages/contracts/src/member';
import { apiLocale, LangSwitch, useLang } from '../i18n';
import { call, forgetDevice, handOffSearch, memberClient, routingClient, setApiLocale } from './client';
import { HelpButton } from './help';
import { Skeleton, Wordmark } from './ui';
import { Onboarding } from './onboarding';
import { Home } from './home';
import { Discover } from './discover';
import { SpacePage } from './space';
import { Settings } from './settings';
import { Profile } from './profile';
import { MySpaces } from './my-spaces';
import { Notifications } from './notifications';
import { Feedback } from './feedback';
import { Icon } from './icons';
import { Moderation } from './moderation';
import { Welcome } from './welcome';

export type MemberRoute = { name: 'onboarding' } | { name: 'home' } | { name: 'discover' } | { name: 'profile' } | { name: 'settings' } | { name: 'my-spaces' } | { name: 'notifications' } | { name: 'moderation' } | { name: 'welcome' } | { name: 'space'; id: string };

export function MemberApp({ route }: { route: MemberRoute }) {
  const { lang,t } = useLang();
  const [ready,setReady] = useState(false),[failed,setFailed] = useState(false),[setupLeft,setSetupLeft] = useState(false);
  setApiLocale(apiLocale(lang));
  useEffect(() => {
    let active = true;
    // The server decides where this account may be; the URL is only a wish.
    resolveDestination(routingClient).then(destination => {
      if (!active) return;
      // The welcome screen (after login) is fine either way; it shows what comes next.
      if (destination.kind === 'member-onboarding') { setSetupLeft(true);if (route.name !== 'onboarding' && route.name !== 'welcome') return window.location.replace('/onboarding'); }
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
  if (route.name === 'welcome') return ready ? <Welcome onboarding={setupLeft}/> : <Bare failed={failed}/>;
  return <Shell route={route} ready={ready}>
    {failed ? <div className="empty"><h1 className="h serif">{t('shell.loadFail')}</h1><p className="p">{t('shell.loadFail.p')}</p><button className="btn" onClick={() => window.location.reload()}>{t('common.reload')}</button></div>
      : !ready ? <Skeleton label={t('loading.page')}/>
      : <>
        {route.name === 'home' && <Home/>}
        {route.name === 'discover' && <Discover/>}
        {route.name === 'profile' && <Profile/>}
        {route.name === 'settings' && <Settings/>}
        {route.name === 'my-spaces' && <MySpaces/>}
        {route.name === 'notifications' && <Notifications/>}
        {route.name === 'moderation' && <Moderation/>}
        {route.name === 'space' && <SpacePage id={route.id}/>}
      </>}
  </Shell>;
}

function Bare({ failed }: { failed: boolean }) {
  const { t } = useLang();
  return <main className="bare">{failed ? <div className="empty"><h1 className="h serif">{t('shell.loadFail')}</h1><p className="p">{t('shell.loadFail.p')}</p><button className="btn" onClick={() => window.location.reload()}>{t('common.reload')}</button></div> : <Skeleton label={t('loading.page')}/>}</main>;
}

function Shell({ route,ready,children }: { route: MemberRoute; ready: boolean; children: React.ReactNode }) {
  const { t } = useLang();
  const [q,setQ] = useState(''),[moderator,setModerator] = useState(false),[unread,setUnread] = useState(0),[menu,setMenu] = useState(false),[feedback,setFeedback] = useState(false),[open,setOpen] = useState(false),[name,setName] = useState('');
  useEffect(() => {
    if (!ready) return;
    call<{ moderator: boolean }>('/moderation/me').then(r => setModerator(r.moderator)).catch(() => {});
    call<MemberNotification[]>('/notifications').then(list => setUnread(list.filter(n => n.unread).length)).catch(() => {});
    call<HomeData>('/home').then(h => setName(h.displayName)).catch(() => {});
  },[ready]);
  const nav = [
    { href: '/home',key: 'nav.home' as const,icon: 'home' as const,on: route.name === 'home' },
    { href: '/discover',key: 'nav.discover' as const,icon: 'discover' as const,on: route.name === 'discover' },
    { href: '/my-spaces',key: 'nav.mine' as const,icon: 'spaces' as const,on: route.name === 'my-spaces' },
    { href: '/notifications',key: 'nav.notifications' as const,short: 'nav.notifications.short' as const,icon: 'bell' as const,on: route.name === 'notifications',badge: route.name === 'notifications' ? 0 : unread },
    { href: '/profile',key: 'nav.profile' as const,icon: 'profile' as const,on: route.name === 'profile' }
  ];
  const search = (event: React.FormEvent) => {
    event.preventDefault();
    handOffSearch(q.trim());
    window.location.assign('/discover');
  };
  const badge = (n?: number) => n ? <span className="badge-n">{n > 9 ? '9+' : n}<span className="visually-hidden"> {t('nav.unread')}</span></span> : null;
  return <div className="app">
    <header className="top">
      <Link href="/home" className="wordmark-link" aria-label="Sandar"><Wordmark/></Link>
      {route.name !== 'discover' && <form className="top-search" role="search" onSubmit={search}><input className="search" type="search" aria-label={t('search.label')} placeholder={t('search.placeholder')} maxLength={100} value={q} onChange={e => setQ(e.target.value)}/></form>}
      <span className="grow"/>
      <LangSwitch/>
      <HelpButton/>
      <span className="account">
        <button type="button" className="avatar" aria-label={t('menu.account')} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}><Icon name="profile" size={20}/></button>
        {menu && <AccountMenu name={name} moderator={moderator} onClose={() => setMenu(false)} onFeedback={() => { setMenu(false);setFeedback(true); }}/>}
      </span>
    </header>
    <div className="app-body">
      <nav className="rail" aria-label={t('nav.main')}>
        <div className={open ? 'rail-in open' : 'rail-in'}>
          <button type="button" className="ri rail-toggle" aria-label={t('nav.toggle')} aria-expanded={open} onClick={() => setOpen(v => !v)}><Icon name="menu"/></button>
          {nav.map(item => <Link key={item.href} href={item.href} className={item.on ? 'ri on' : 'ri'} aria-current={item.on ? 'page' : undefined} title={t(item.key)}><Icon name={item.icon}/><span className="ri-label">{t(item.key)}</span>{badge(item.badge)}</Link>)}
          {moderator && <Link href="/moderation" className={route.name === 'moderation' ? 'ri on' : 'ri'} title={t('nav.moderation')}><Icon name="shield"/><span className="ri-label">{t('nav.moderation')}</span></Link>}
          <span className="grow"/>
          <button type="button" className="ri quiet" title={t('fb.title')} onClick={() => setFeedback(true)}><Icon name="chat"/><span className="ri-label">{t('fb.title')}</span></button>
        </div>
      </nav>
      <main className="app-main">{children}</main>
    </div>
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      {nav.map(item => <Link key={item.href} href={item.href} className={item.on ? 'on' : ''} aria-current={item.on ? 'page' : undefined}><Icon name={item.icon}/>{badge(item.badge)}<span>{t(item.short ?? item.key)}</span></Link>)}
    </nav>
    {feedback && <Feedback onClose={() => setFeedback(false)}/>}
  </div>;
}

// WA-08b: a small popup on the avatar, a bottom sheet on phones. Log out never asks first.
function AccountMenu({ name,moderator,onClose,onFeedback }: { name: string; moderator: boolean; onClose: () => void; onFeedback: () => void }) {
  const { t } = useLang();
  const box = useRef<HTMLDivElement>(null),[leaving,setLeaving] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const away = (event: MouseEvent) => { if (!box.current?.parentElement?.contains(event.target as Node)) onClose(); };
    document.addEventListener('keydown',key);document.addEventListener('mousedown',away);
    box.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => { document.removeEventListener('keydown',key);document.removeEventListener('mousedown',away); };
  },[onClose]);
  const logout = async () => {
    setLeaving(true);
    forgetDevice();
    try { await memberClient().logout(); } catch { /* The server clears the cookie; go to login either way. */ }
    window.location.assign('/login');
  };
  return <div ref={box} className="account-menu" role="menu" aria-label={t('menu.account')}>
    <Link role="menuitem" className="menu-item strong" href="/profile"><span className="grow">{name}<span className="sm block">{t('menu.viewProfile')}</span></span><span aria-hidden="true">›</span></Link>
    <button role="menuitem" type="button" className="menu-item" onClick={onFeedback}>{t('fb.title')}</button>
    <Link role="menuitem" className="menu-item" href="/settings">{t('menu.settings')}</Link>
    {moderator && <Link role="menuitem" className="menu-item only-phone" href="/moderation">{t('nav.moderation')}</Link>}
    <button role="menuitem" type="button" className="menu-item" onClick={() => void logout()} disabled={leaving}>{t('common.logout')}</button>
  </div>;
}
