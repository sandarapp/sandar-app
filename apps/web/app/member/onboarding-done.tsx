'use client';
import { useEffect, useState } from 'react';
import type { DiscoveryData } from '../../../../packages/contracts/src/discovery';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import type { Space } from '../../../../packages/contracts/src/spaces';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, label, spacePhoto } from './copy';

type Privacy = NonNullable<OnboardingState['privacy']>;

// WA-02b: one short "done" screen. Left: what we'll use. Right: three picks
// that match the answers, with one-tap Join. The goal is a first join or read.
export function Done({ privacy,needs,goals }: { privacy: Privacy; needs: string[]; goals: string[] }) {
  const { lang,t } = useLang();
  const [picks,setPicks] = useState<{ space: Space; reason: string }[] | null>(null),[busy,setBusy] = useState(''),[error,setError] = useState('');
  useEffect(() => {
    Promise.all([call<DiscoveryData>('/discovery/search',{ method: 'POST',body: { q: '',topics: [],page: 0 } }),call<Space[]>('/spaces')]).then(([found,spaces]) => {
      const byId = new Map(spaces.map(s => [s.id,s]));
      setPicks(found.results.filter(r => byId.has(r.id)).slice(0,3).map(r => {
        const match = needs.find(n => r.topics.includes(n as never));
        return { space: byId.get(r.id)!,reason: match ? t('home.because',{ topic: label(lang,match) }) : t('home.open') };
      }));
    }).catch(() => setPicks([]));
  },[needs,lang,t]);
  const join = async (space: Space) => {
    setBusy(space.id);setError('');
    try {
      const joined = await call<Space>(`/spaces/${space.id}/join`,{ method: 'POST',body: { accepted: true,guidelinesVersion: space.guidelinesVersion } });
      setPicks(list => list?.map(p => p.space.id === space.id ? { ...p,space: joined } : p) ?? null);
    } catch (e) { setError(codeOf(e)); }
    finally { setBusy(''); }
  };
  return <div className="done-grid">
    <section className="stack">
      <p className="kk">{t('od.kicker')}</p>
      <h1 className="h">{t('od.title',{ name: privacy.displayName })}</h1>
      <p className="p">{t('od.lead')}</p>
      <dl className="review">
        <div><dt>{t('od.topics')}</dt><dd>{needs.map(n => label(lang,n)).join(', ') || t('onb.review.none')}</dd></div>
        <div><dt>{t('od.part')}</dt><dd>{goals.map(g => label(lang,g)).join(', ') || t('onb.review.none')}</dd></div>
        <div><dt>{t('od.privacy')}</dt><dd>{`${privacy.displayName} · ${privacy.allowAnonymousPosting ? t('od.anon') : t('od.named')} · ${privacy.directoryVisibility === 'DISPLAY_NAME' ? t('od.shown') : t('od.hidden')}`}</dd></div>
      </dl>
      <a className="btn fit" href="/home">{t('od.goHome')}</a>
      <p className="sm">{t('od.safety')}</p>
    </section>
    <section className="stack">
      <p className="kk">{t('od.firstStep')}</p>
      <h2 className="h3">{t('od.picks')}</h2>
      {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
      {picks === null ? <p className="sm">{t('common.loading')}</p> : <ul className="mini-list">{picks.map(({ space,reason }) => <li key={space.id} className="pick">
        <span className="mini-photo" style={{ backgroundImage: `url(${spacePhoto(space.id)})` }} aria-hidden="true"/>
        <span className="stack-xs grow"><strong className="serif">{space.name}</strong><span className="sm">{reason}</span></span>
        {space.membership === 'JOINED' ? <span className="chip-tag">{t('od.joined')}</span> : <button type="button" className="btn small" onClick={() => void join(space)} disabled={busy !== ''}>{busy === space.id ? t('common.working') : t('od.join')}</button>}
      </li>)}</ul>}
      {goals.includes('READ_QUIETLY') && <p className="alert a-info">{t('od.readFirst')}</p>}
    </section>
  </div>;
}
