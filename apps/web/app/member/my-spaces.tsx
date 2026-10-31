'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { DiscoveryData } from '../../../../packages/contracts/src/discovery';
import type { MySpace } from '../../../../packages/contracts/src/member';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import type { Space, SpacePost } from '../../../../packages/contracts/src/spaces';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, label, spacePhoto, timeAgo } from './copy';
import { CreateSpace } from './create-space';
import { Skeleton } from './ui';

type Latest = { post: SpacePost; space: MySpace };
const QUIET_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

// WA-11e: what's new in the spaces a member joined or hosts, with something useful
// beside them. A space in review shows only to its host. Latest posts stay on Home on phones.
export function MySpaces() {
  const { lang,t } = useLang();
  const [list,setList] = useState<MySpace[] | null>(null),[error,setError] = useState(''),[creating,setCreating] = useState(false);
  const [latest,setLatest] = useState<Latest[]>([]),[suggested,setSuggested] = useState<{ space: Space; note: string }[]>([]);
  const load = useCallback(async () => {
    setError('');
    try {
      const mine = await call<MySpace[]>('/spaces/mine');
      setList(mine);
      const active = mine.filter(s => s.joined && s.lastPostAt).slice(0,3);
      void Promise.all(active.map(space => call<SpacePost[]>(`/spaces/${space.id}/posts`).then(posts => posts.map(post => ({ post,space }))).catch(() => [])))
        .then(pages => setLatest(pages.flat().filter(item => item.post.status === 'VISIBLE').sort((a,b) => b.post.createdAt.localeCompare(a.post.createdAt)).slice(0,3)));
      // Suggestions only help; the page works without them.
      void Promise.all([call<Space[]>('/spaces'),call<OnboardingState>('/users/me/onboarding').catch(() => null),call<DiscoveryData>('/discovery/search',{ method: 'POST',body: { q: '',topics: [],page: 0 } }).catch(() => null)])
        .then(([spaces,onboarding,discovery]) => {
          const needs = onboarding?.preferences?.needs ?? [];
          const topics = Object.fromEntries((discovery?.results ?? []).map(r => [r.id,r.topics]));
          setSuggested(spaces.filter(s => s.membership !== 'JOINED' && s.permissions.join).map(space => {
            const match = needs.find(n => topics[space.id]?.includes(n));
            return { space,match,note: match ? t('home.because',{ topic: label(lang,match) }) : t('home.open') };
          }).sort((a,b) => Number(Boolean(b.match)) - Number(Boolean(a.match))).slice(0,3));
        }).catch(() => {});
    } catch (e) { setError(codeOf(e)); }
  },[lang,t]);
  useEffect(() => { void load(); },[load]);
  if (error) return <div className="empty"><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div>;
  if (!list) return <Skeleton label={t('loading.page')} variant="page"/>;

  const hosting = list.filter(s => s.hosted),joined = list.filter(s => !s.hosted);
  const fresh = list.reduce((sum,s) => sum + s.newCount,0);
  const side = <aside className="home-side">
    {suggested.length > 0 && <section className="stack-sm">
      <h2 className="kk">{t('mine.suggest')}</h2>
      <ul className="stack-sm">{suggested.map(({ space,note }) => <li key={space.id} className="mine-suggest">
        <span className="stack-xs"><strong className="serif">{space.name}</strong><span className="sm">{note}</span></span>
        <Link className="btn2 small" href={`/spaces/${space.id}`}>{t('mine.join')}</Link>
      </li>)}</ul>
      <Link href="/discover" className="sm-link">{t('home.seeAll')}</Link>
    </section>}
    <section className="side-card">
      <strong className="serif">{t('mine.card.t')}</strong>
      <p className="sm">{t('mine.card.p')}</p>
      <button type="button" className="btn small" onClick={() => setCreating(true)}>{t('mine.start')}</button>
    </section>
  </aside>;

  return <div className="stack-lg">
    <header className="stack-xs"><h1 className="display serif">{t('nav.mine')}</h1>
      {list.length > 0 && <p className="sm">{fresh ? t('mine.summary',{ n: list.length,m: fresh }) : t('mine.caught',{ n: list.length })}</p>}</header>
    <div className="mine-layout">
      {!list.length ? <section className="panel stack">
        <h2 className="h3 serif">{t('mine.empty.t')}</h2>
        <p className="p">{t('mine.empty.p')}</p>
        <div className="chips"><Link className="btn" href="/discover">{t('invite.find')}</Link></div>
      </section> : <div className="stack-lg">
        {hosting.length > 0 && <section className="stack-sm"><h2 className="kk">{t('mine.hosting')}</h2><ul className="stack-sm">{hosting.map(s => <SpaceRow key={s.id} space={s}/>)}</ul></section>}
        {joined.length > 0 && <section className="stack-sm">{hosting.length > 0 && <h2 className="kk">{t('mine.joined')}</h2>}<ul className="stack-sm">{joined.map(s => <SpaceRow key={s.id} space={s}/>)}</ul></section>}
        {latest.length > 0 && <section className="stack-sm mine-latest"><h2 className="kk">{t('mine.latest')}</h2><ul className="stack-sm">{latest.map(({ post,space }) => <li key={post.id}><Link href={`/spaces/${space.id}`} className="mine-card">
          <span className="stack-xs grow"><span className="p quote">{post.body}</span>
            <span className="sm">{post.identityMode === 'ANONYMOUS' ? t('post.anonymous') : post.authorName} · {space.name} · {timeAgo(post.createdAt,lang,t)} · {t('mine.reply')}</span></span>
        </Link></li>)}</ul></section>}
      </div>}
      {side}
    </div>
    {creating && <CreateSpace onClose={() => setCreating(false)}/>}
  </div>;
}

function SpaceRow({ space: s }: { space: MySpace }) {
  const { t } = useLang();
  const waiting = s.hosted && s.status !== 'ACTIVE' && s.status !== 'RESTRICTED';
  const quiet = !s.lastPostAt || Date.now() - new Date(s.lastPostAt).getTime() > QUIET_DAYS * DAY;
  const preview = s.preview && `${s.preview.identityMode === 'ANONYMOUS' ? t('post.anonymous') : s.preview.authorName ?? 'Sandar'} · ${s.preview.body}`;
  return <li><Link href={`/spaces/${s.id}`} className="mine-card">
    <span className="mini-photo" style={{ backgroundImage: `url(${spacePhoto(s.id)})` }} aria-hidden="true"/>
    <span className="stack-xs grow">
      <span className="mine-title"><strong className="serif">{s.name}</strong>
        {s.newCount > 0 && <span className="mine-new">{t('mine.new',{ n: s.newCount })}</span>}
        {waiting && <span className="tag-review">{t(`cs.status.${s.status as 'IN_REVIEW'}`)}</span>}</span>
      <span className="sm">{s.kind === 'OFFICIAL_SANDAR' ? t('mine.official') : t('mine.memberSpace')} · {t('mine.members',{ n: s.memberCount })}{quiet && !waiting ? ` · ${t('mine.quiet')}` : ''}</span>
      {s.status === 'RESTRICTED' ? <span className="sm">{t('mine.paused')}</span>
        : waiting ? <span className="sm">{t('mine.review.p')}</span>
        : quiet ? <span className="sm">{t('mine.quiet.p')}</span>
        : preview && <span className="sm quote">{preview}</span>}
    </span>
    <span aria-hidden="true">→</span>
  </Link></li>;
}
