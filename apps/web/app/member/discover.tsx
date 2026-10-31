'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { discoveryTopics, type DiscoveryData, type DiscoveryResult } from '../../../../packages/contracts/src/discovery';
import { useLang } from '../i18n';
import { call, codeOf, takeSearch } from './client';
import { errorKey, label, spacePhoto } from './copy';
import { communityFlow } from '../flags';
import { Skeleton } from './ui';

type Topic = typeof discoveryTopics[number];

export function Discover() {
  const { lang,t } = useLang();
  const [q,setQ] = useState(''),[topics,setTopics] = useState<Topic[]>([]);
  useEffect(() => { const handed = takeSearch();if (handed) setQ(handed); },[]);
  const [results,setResults] = useState<DiscoveryResult[]>([]),[next,setNext] = useState<number | null>(null);
  const [loading,setLoading] = useState(true),[error,setError] = useState(''),[personal,setPersonal] = useState(false);

  const search = useCallback(async (page: number,query: string,chosen: Topic[]) => {
    setLoading(true);setError('');
    try {
      const data = await call<DiscoveryData>('/discovery/search',{ method: 'POST',body: { q: query.trim(),topics: chosen,page } });
      setResults(r => page === 0 ? data.results : [...r,...data.results]);setNext(data.nextPage);setPersonal(data.personalized);
    } catch (e) { setError(codeOf(e)); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => { const timer = setTimeout(() => void search(0,q,topics),q ? 300 : 0);return () => clearTimeout(timer); },[q,topics,search]);

  const toggle = (topic: Topic) => setTopics(list => list.includes(topic) ? list.filter(x => x !== topic) : [...list,topic]);
  return <div className="stack-lg">
    <header className="stack">
      <h1 className="display serif">{t('disc.title')}</h1>
      <p className="p">{personal && !q && !topics.length ? t('disc.leadPersonal') : t('disc.lead')}</p>
      <label className="lbl visually-label">{t('search.label')}<input className="search wide" type="search" value={q} maxLength={100} placeholder={t('disc.placeholder')} onChange={e => setQ(e.target.value)}/></label>
      <div className="chips" role="group" aria-label={t('disc.filters')}>
        <button type="button" className={topics.length ? 'chip' : 'chip on'} aria-pressed={!topics.length} onClick={() => setTopics([])}>{t('disc.all')}</button>
        {discoveryTopics.map(topic => <button key={topic} type="button" className={topics.includes(topic) ? 'chip on' : 'chip'} aria-pressed={topics.includes(topic)} onClick={() => toggle(topic)}>{label(lang,topic)}</button>)}
      </div>
    </header>

    {error && <p className="alert a-err" role="alert">{t(errorKey(error))} <button className="link-button" onClick={() => void search(0,q,topics)}>{t('common.tryAgain')}</button></p>}
    <section aria-live="polite" className="stack">
      {!loading && !error && !results.length && <div className="dashed"><strong className="serif">{t('disc.empty')}</strong><p className="sm">{t('disc.empty.p')}</p>{topics.length > 0 && <button className="btn2 fit" onClick={() => setTopics([])}>{t('disc.clear')}</button>}</div>}
      <ul className="grid">{results.map(r => {
        const official = r.kind === 'OFFICIAL_SANDAR';
        const body = <>
          <span className="sp-img" style={{ backgroundImage: `url(${spacePhoto(r.id)})` }} aria-hidden="true"/>
          <span className="sp-body">
            <span className={official ? 'mini mo' : 'mini'}>{official ? t('disc.official') : t('disc.verified')}</span>
            <strong className="serif">{r.name}</strong>
            <span className="sm">{official ? t('disc.openToJoin') : r.topics.slice(0,2).map(x => label(lang,x)).join(' · ')}</span>
          </span>
        </>;
        // Partner community pages open in a later release; their cards stay informational.
        return <li key={r.id}>{official ? <Link href={`/spaces/${r.id}`} className="sp">{body}</Link> : <div className="sp muted">{body}<span className="badge">{t('disc.soon')}</span></div>}</li>;
      })}</ul>
      {loading && <Skeleton label={t('disc.searching')} variant="page"/>}
      {next !== null && !loading && <button className="btn2 fit" onClick={() => void search(next,q,topics)}>{t('disc.more')}</button>}
      {communityFlow && <p className="sm">{t('disc.note')}</p>}
    </section>
  </div>;
}
