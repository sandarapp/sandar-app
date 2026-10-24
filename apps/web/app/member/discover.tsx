'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { discoveryTopics, type DiscoveryData, type DiscoveryResult } from '../../../../packages/contracts/src/discovery';
import { call, codeOf } from './client';
import { errorText, labels } from './copy';

type Topic = typeof discoveryTopics[number];

export function Discover() {
  const [q,setQ] = useState(''),[topics,setTopics] = useState<Topic[]>([]);
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

  const toggle = (t: Topic) => setTopics(list => list.includes(t) ? list.filter(x => x !== t) : [...list,t]);
  return <div className="m-stack">
    <section>
      <h1 className="m-title">Jelajah</h1>
      <p className="m-lead">{personal && !q && !topics.length ? 'Diurutkan dari topik yang kamu pilih waktu daftar.' : 'Cari ruang berdasarkan nama atau topik.'}</p>
      <label className="m-field m-search">Cari<input type="search" value={q} maxLength={100} placeholder="mis. kerja, kesepian" onChange={e => setQ(e.target.value)}/></label>
      <div className="m-chips" aria-label="Filter topik">{discoveryTopics.map(t => <button key={t} type="button" className={topics.includes(t) ? 'm-choice on' : 'm-choice'} aria-pressed={topics.includes(t)} onClick={() => toggle(t)}>{labels[t]}</button>)}</div>
      {topics.length > 0 && <button className="m-text" onClick={() => setTopics([])}>Hapus filter</button>}
    </section>

    {error && <div className="m-error" role="alert">{errorText(error)} <button className="m-text" onClick={() => void search(0,q,topics)}>Coba lagi</button></div>}
    <section aria-live="polite">
      {!loading && !error && !results.length && <div className="m-empty small"><h2>Belum ada yang cocok.</h2><p>Coba kata lain atau hapus beberapa filter. Komunitas lain akan bergabung setelah diverifikasi.</p></div>}
      <ul className="m-cards">{results.map(r => {
        const body = <>
          <span className="m-card-mark" aria-hidden="true">{r.name.slice(0,1)}</span>
          <span className="m-card-body"><strong>{r.name}</strong><span>{r.purpose}</span>
            <span className="m-tags">{r.kind === 'OFFICIAL_SANDAR' ? 'Ruang resmi Sandar' : 'Komunitas terverifikasi'}{r.topics.slice(0,2).map(t => ` · ${labels[t] ?? t}`).join('')}</span></span>
        </>;
        // Partner community pages open in a later release; their cards stay informational.
        return <li key={r.id}>{r.kind === 'OFFICIAL_SANDAR'
          ? <Link href={`/spaces/${r.id}`} className="m-card">{body}<span aria-hidden="true" className="m-arrow">→</span></Link>
          : <div className="m-card muted">{body}<span className="m-badge">Segera</span></div>}</li>;
      })}</ul>
      {loading && <p className="m-loading" role="status">Mencari…</p>}
      {next !== null && !loading && <button className="m-button secondary" onClick={() => void search(next,q,topics)}>Muat lagi</button>}
    </section>
  </div>;
}
