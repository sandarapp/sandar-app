'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { DiscoveryData } from '../../../../packages/contracts/src/discovery';
import type { HomeData } from '../../../../packages/contracts/src/home';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import type { Space } from '../../../../packages/contracts/src/spaces';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, label, spacePhoto } from './copy';

export function Home() {
  const { lang,t } = useLang();
  const [home,setHome] = useState<HomeData | null>(null),[spaces,setSpaces] = useState<Space[]>([]),[error,setError] = useState('');
  const [needs,setNeeds] = useState<string[]>([]),[topics,setTopics] = useState<Record<string,string[]>>({});
  const visit = useRef(false);
  const load = async () => {
    setError('');
    try {
      const [h,s] = await Promise.all([call<HomeData>('/home'),call<Space[]>('/spaces')]);
      setHome(h);setSpaces(s);
      // Only used to explain a pick ("because you chose …"); Home works without it.
      void Promise.all([call<OnboardingState>('/users/me/onboarding'),call<DiscoveryData>('/discovery/search',{ method: 'POST',body: { q: '',topics: [],page: 0 } })])
        .then(([o,d]) => { setNeeds(o.preferences?.needs ?? []);setTopics(Object.fromEntries(d.results.map(r => [r.id,r.topics]))); }).catch(() => {});
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

  if (error) return <div className="empty"><h1 className="h serif">{t('home.loadFail')}</h1><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div>;
  if (!home) return <p className="loading" role="status">{t('common.loading')}</p>;

  const joined = spaces.filter(s => s.membership === 'JOINED');
  const others = spaces.filter(s => s.membership !== 'JOINED' && s.permissions.join);
  const resume = home.continueContext && spaces.find(s => s.id === home.continueContext!.spaceId);
  const reason = (s: Space) => {
    const match = needs.find(n => topics[s.id]?.includes(n));
    return match ? t('home.because',{ topic: label(lang,match) }) : t('home.open');
  };
  return <div className="with-side">
    <div className="stack-lg">
      <header>
        <p className="sm">{home.firstVisit ? t('home.welcome',{ name: home.displayName }) : t('home.again',{ name: home.displayName })}</p>
        <h1 className="display serif">{home.firstVisit ? t('home.titleFirst') : t('home.title')}</h1>
      </header>

      {resume && <Link className="resume" href={`/spaces/${resume.id}`}><span className="kk">{t('home.continue')}</span><strong className="serif">{resume.name}</strong><span aria-hidden="true">→</span></Link>}

      {joined.length > 0 && <section className="stack">
        <h2 className="kk">{t('home.yourSpaces')}</h2>
        <ul className="grid">{joined.map(s => <SpaceCard key={s.id} space={s} note={t('home.joined')}/>)}</ul>
      </section>}

      <section className="stack">
        <h2 className="kk">{t('home.official')}</h2>
        {others.length ? <ul className="grid">{others.map(s => <SpaceCard key={s.id} space={s} note={reason(s)}/>)}</ul> : <p className="sm">{t('home.allJoined')}</p>}
      </section>

      <section className="stack">
        <div className="row-between"><h2 className="kk">{t('home.verified')}</h2><Link href="/discover" className="sm-link">{t('home.seeAll')}</Link></div>
        <div className="dashed"><strong className="serif">{t('home.noCommunities')}</strong><p className="sm">{t('home.noCommunities.p')}</p></div>
      </section>

      {!spaces.some(s => s.permissions.post) && <p className="alert a-info"><strong>{t('closed.title')}</strong> {t('closed.home')}</p>}
    </div>
    <aside className="side-card">
      <h2 className="q">{t('shell.boundaries')}</h2>
      <p className="sm">{t('shell.boundaries.p')}</p>
    </aside>
  </div>;
}

export function SpaceCard({ space,note }: { space: Pick<Space,'id' | 'name'>; note: string }) {
  return <li><Link href={`/spaces/${space.id}`} className="sp">
    <span className="sp-img" style={{ backgroundImage: `url(${spacePhoto(space.id)})` }} aria-hidden="true"/>
    <span className="sp-body"><strong className="serif">{space.name}</strong><span className="sm">{note}</span></span>
  </Link></li>;
}
