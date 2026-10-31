'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { MySpace } from '../../../../packages/contracts/src/member';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, spacePhoto, timeAgo } from './copy';
import { CreateSpace } from './create-space';
import { Skeleton } from './ui';

// WA-11d: everything a member joined or hosts. A space in review shows only to its host.
export function MySpaces() {
  const { lang,t } = useLang();
  const [list,setList] = useState<MySpace[] | null>(null),[error,setError] = useState(''),[creating,setCreating] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try { setList(await call<MySpace[]>('/spaces/mine')); } catch (e) { setError(codeOf(e)); }
  },[]);
  useEffect(() => { void load(); },[load]);
  if (error) return <div className="empty"><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div>;
  if (!list) return <Skeleton label={t('loading.page')} variant="page"/>;
  return <div className="stack-lg narrow wide-ish">
    <header className="row-between"><h1 className="display serif">{t('nav.mine')}</h1>{list.length > 0 && <button type="button" className="btn2" onClick={() => setCreating(true)}>{t('mine.start')}</button>}</header>
    {!list.length ? <section className="panel stack">
      <h2 className="h3 serif">{t('mine.empty.t')}</h2>
      <p className="p">{t('mine.empty.p')}</p>
      <div className="chips"><Link className="btn" href="/discover">{t('invite.find')}</Link><button type="button" className="btn2" onClick={() => setCreating(true)}>{t('mine.startOwn')}</button></div>
    </section> : <ul className="mini-list">{list.map(s => <li key={s.id}><Link href={`/spaces/${s.id}`} className="mini-space">
      <span className="mini-photo" style={{ backgroundImage: `url(${spacePhoto(s.id)})` }} aria-hidden="true"/>
      <span className="stack-xs grow"><strong className="serif">{s.name}</strong><span className="sm">{s.hosted ? (s.status === 'ACTIVE' ? t('mine.host') : t(`cs.status.${s.status as 'IN_REVIEW'}`)) : s.lastPostAt ? t('mine.last',{ when: timeAgo(s.lastPostAt,lang,t) }) : t('mine.noPosts')}</span></span>
      <span aria-hidden="true">→</span>
    </Link></li>)}</ul>}
    {creating && <CreateSpace onClose={() => setCreating(false)}/>}
  </div>;
}
