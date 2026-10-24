'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { HomeData } from '../../../../packages/contracts/src/home';
import type { Space } from '../../../../packages/contracts/src/spaces';
import { call, codeOf } from './client';
import { errorText } from './copy';

export function Home() {
  const [home,setHome] = useState<HomeData | null>(null),[spaces,setSpaces] = useState<Space[]>([]),[error,setError] = useState('');
  const visit = useRef(false);
  const load = async () => {
    setError('');
    try {
      const [h,s] = await Promise.all([call<HomeData>('/home'),call<Space[]>('/spaces')]);
      setHome(h);setSpaces(s);
    } catch (e) { setError(codeOf(e)); }
  };
  useEffect(() => {
    // One visit per page load, recorded after Home is read so "first visit" stays true on the first one.
    void load().then(() => {
      if (visit.current) return;
      visit.current = true;
      void call('/home/visits',{ method: 'POST',body: { visitId: crypto.randomUUID() } }).catch(() => {});
    });
  },[]);

  if (error) return <div className="m-empty"><h1>Belum bisa memuat Beranda.</h1><p>{errorText(error)}</p><button className="m-button" onClick={() => void load()}>Coba lagi</button></div>;
  if (!home) return <p className="m-loading" role="status">Memuat…</p>;

  const joined = spaces.filter(s => s.membership === 'JOINED');
  const others = spaces.filter(s => s.membership !== 'JOINED' && s.permissions.join);
  const resume = home.continueContext && spaces.find(s => s.id === home.continueContext!.spaceId);
  return <div className="m-stack">
    <section>
      <h1 className="m-title">{home.firstVisit ? `Selamat datang, ${home.displayName}.` : `Hai lagi, ${home.displayName}.`}</h1>
      <p className="m-lead">{joined.length ? 'Ini ruang-ruangmu. Baca pelan-pelan, kasih reaksi kalau ada yang terasa dekat.' : 'Mulai dengan satu ruang. Kamu bisa baca dulu sebelum memutuskan apa-apa.'}</p>
    </section>

    {resume && <Link className="m-resume" href={`/spaces/${resume.id}`}><span className="m-small">Lanjut membaca</span><strong>{resume.name}</strong><span aria-hidden="true">→</span></Link>}

    {joined.length > 0 && <section>
      <h2 className="m-section">Ruangmu</h2>
      <ul className="m-cards">{joined.map(s => <SpaceCard key={s.id} space={s}/>)}</ul>
    </section>}

    <section>
      <h2 className="m-section">{joined.length ? 'Ruang lain dari Sandar' : 'Ruang resmi Sandar'}</h2>
      {others.length ? <ul className="m-cards">{others.map(s => <SpaceCard key={s.id} space={s}/>)}</ul> : <p className="m-small">Kamu sudah bergabung di semua ruang yang tersedia.</p>}
      <Link href="/discover" className="m-text-link">Cari ruang berdasarkan topik →</Link>
    </section>

    <aside className="m-note">
      <strong>Posting belum dibuka.</strong> Kami tunggu tim moderasi lengkap dulu, supaya setiap ruang ada yang jaga. Sementara ini kamu bisa baca dan kasih reaksi.
    </aside>
  </div>;
}

export function SpaceCard({ space }: { space: Pick<Space,'id' | 'name' | 'purpose' | 'membership'> }) {
  return <li><Link href={`/spaces/${space.id}`} className="m-card">
    <span className="m-card-mark" aria-hidden="true">{space.name.slice(0,1)}</span>
    <span className="m-card-body"><strong>{space.name}</strong><span>{space.purpose}</span></span>
    {space.membership === 'JOINED' ? <span className="m-badge">Bergabung</span> : <span aria-hidden="true" className="m-arrow">→</span>}
  </Link></li>;
}
