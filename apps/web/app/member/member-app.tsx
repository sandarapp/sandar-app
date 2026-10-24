'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClientError } from '../../../../packages/auth-client/src/client';
import { resolveDestination } from '../../../../packages/auth-client/src/destination';
import { memberClient } from './client';
import { helpLines } from './copy';
import { Onboarding } from './onboarding';
import { Home } from './home';
import { Discover } from './discover';
import { SpacePage } from './space';

export type MemberRoute = { name: 'onboarding' } | { name: 'home' } | { name: 'discover' } | { name: 'space'; id: string };

export function MemberApp({ route }: { route: MemberRoute }) {
  const [ready,setReady] = useState(false),[failed,setFailed] = useState(false);
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

  if (failed) return <Shell route={route}><div className="m-empty"><h1>Belum bisa memuat Sandar.</h1><p>Periksa koneksimu, lalu muat ulang halaman ini.</p><button className="m-button" onClick={() => window.location.reload()}>Muat ulang</button></div></Shell>;
  if (!ready) return <Shell route={route}><p className="m-loading" role="status">Memuat…</p></Shell>;
  return <Shell route={route}>
    {route.name === 'onboarding' && <Onboarding/>}
    {route.name === 'home' && <Home/>}
    {route.name === 'discover' && <Discover/>}
    {route.name === 'space' && <SpacePage id={route.id}/>}
  </Shell>;
}

function Shell({ route,children }: { route: MemberRoute; children: React.ReactNode }) {
  const [help,setHelp] = useState(false),[leaving,setLeaving] = useState(false);
  const logout = async () => {
    setLeaving(true);
    try { await memberClient().logout(); } catch { /* The server clears the cookie; go to login either way. */ }
    window.location.assign('/login');
  };
  const onboarding = route.name === 'onboarding';
  return <div className="m-page">
    <header className="m-header">
      <Link href={onboarding ? '/onboarding' : '/home'} className="m-brand">Sandar</Link>
      {!onboarding && <nav className="m-nav" aria-label="Menu utama">
        <Link href="/home" aria-current={route.name === 'home' ? 'page' : undefined}>Beranda</Link>
        <Link href="/discover" aria-current={route.name === 'discover' ? 'page' : undefined}>Jelajah</Link>
      </nav>}
      <div className="m-header-actions">
        <button className="m-help-button" onClick={() => setHelp(true)}>Butuh bantuan?</button>
        <button className="m-text" onClick={() => void logout()} disabled={leaving}>Keluar</button>
      </div>
    </header>
    <main className="m-main">{children}</main>
    {help && <div className="m-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={() => setHelp(false)}>
      <div className="m-sheet" onClick={event => event.stopPropagation()}>
        <h2 id="help-title">Kalau sedang darurat, jangan tunggu di sini.</h2>
        <p>Sandar adalah dukungan sebaya, bukan layanan darurat. Hubungi layanan resmi ini:</p>
        <ul className="m-help-list">{helpLines.map(line => <li key={line.n}><a href={`tel:${line.n.split(' ')[0]!.replace(/\D/g,'')}`}>{line.n}</a><span>{line.l}</span></li>)}</ul>
        <p className="m-small">Layanan resmi Kementerian Kesehatan, bukan dari Sandar.</p>
        <button className="m-button" onClick={() => setHelp(false)} autoFocus>Tutup</button>
      </div>
    </div>}
  </div>;
}
