'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscoveryData } from '../../../../packages/contracts/src/discovery';
import type { HomeData } from '../../../../packages/contracts/src/home';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import type { Space, SpacePost } from '../../../../packages/contracts/src/spaces';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, label, spacePhoto } from './copy';
import { Composer, Post } from './space';
import { Skeleton } from './ui';
import { communityFlow } from '../flags';

type FeedItem = { post: SpacePost; space: Space };

// Home: post and read in the middle, spaces on the side. Every member reads every
// space here; one who hasn't joined anything yet sees the official spaces first.
export function Home() {
  const { lang,t } = useLang();
  const [home,setHome] = useState<HomeData | null>(null),[spaces,setSpaces] = useState<Space[]>([]),[error,setError] = useState('');
  const [feed,setFeed] = useState<FeedItem[] | null>(null),[notice,setNotice] = useState(''),[feedError,setFeedError] = useState('');
  const [needs,setNeeds] = useState<string[]>([]),[topics,setTopics] = useState<Record<string,string[]>>({});
  const visit = useRef(false);

  // Posts from every readable space, newest first. Four official spaces at most, so one request each.
  const loadFeed = useCallback(async (list: Space[]) => {
    const readable = list.filter(s => s.permissions.read);
    const pages = await Promise.all(readable.map(s => call<SpacePost[]>(`/spaces/${s.id}/posts`).then(posts => posts.map(post => ({ post,space: s }))).catch(() => [])));
    setFeed(pages.flat().sort((a,b) => b.post.createdAt.localeCompare(a.post.createdAt)).slice(0,40));
  },[]);
  const load = useCallback(async () => {
    setError('');
    try {
      const [h,s] = await Promise.all([call<HomeData>('/home'),call<Space[]>('/spaces')]);
      setHome(h);setSpaces(s);
      void loadFeed(s);
      // Only used to explain a pick ("because you chose …"); Home works without it.
      void Promise.all([call<OnboardingState>('/users/me/onboarding'),call<DiscoveryData>('/discovery/search',{ method: 'POST',body: { q: '',topics: [],page: 0 } })])
        .then(([o,d]) => { setNeeds(o.preferences?.needs ?? []);setTopics(Object.fromEntries(d.results.map(r => [r.id,r.topics]))); }).catch(() => {});
    } catch (e) { setError(codeOf(e)); }
  },[loadFeed]);
  useEffect(() => {
    // One visit per page load, recorded after Home is read so "first visit" stays true on the first one.
    void load().then(() => {
      if (visit.current) return;
      visit.current = true;
      void call('/home/visits',{ method: 'POST',body: { visitId: crypto.randomUUID() } }).catch(() => {});
    });
  },[load]);

  if (error) return <div className="empty"><h1 className="h serif">{t('home.loadFail')}</h1><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div>;
  if (!home) return <Skeleton label={t('loading.home')}/>;

  const joined = spaces.filter(s => s.membership === 'JOINED');
  const others = spaces.filter(s => s.membership !== 'JOINED' && s.permissions.join);
  const postable = joined.filter(s => s.permissions.post);
  const resume = home.continueContext && spaces.find(s => s.id === home.continueContext!.spaceId);
  const reason = (s: Space) => {
    const match = needs.find(n => topics[s.id]?.includes(n));
    return match ? t('home.because',{ topic: label(lang,match) }) : t('home.open');
  };
  const replace = (next: SpacePost) => setFeed(list => list?.map(item => item.post.id === next.id ? { ...item,post: next } : item) ?? null);
  const remove = (postId: string) => setFeed(list => list?.filter(item => item.post.id !== postId) ?? null);

  return <div className="home-layout">
    <div className="stack-lg">
      <header>
        <p className="sm">{home.firstVisit ? t('home.welcome',{ name: home.displayName }) : t('home.again',{ name: home.displayName })}</p>
        <h1 className="display serif">{home.firstVisit ? t('home.titleFirst') : t('home.title')}</h1>
      </header>

      {home.firstVisit && <Tips/>}

      {resume && <Link className="resume" href={`/spaces/${resume.id}`}><span className="kk">{t('home.continue')}</span><strong className="serif">{resume.name}</strong><span aria-hidden="true">→</span></Link>}

      {notice && <p className="alert a-ok" role="status">{notice}</p>}
      {feedError && <p className="alert a-err" role="alert">{t(errorKey(feedError))}</p>}

      {joined.length === 0 ? <section className="stack">
        <p className="p">{t('home.startJoin')}</p>
        <h2 className="kk">{t('home.official')}</h2>
        <ul className="grid">{others.map(s => <SpaceCard key={s.id} space={s} note={reason(s)}/>)}</ul>
      </section> : postable.length > 0 ? <Composer spaces={postable} onSent={async () => { setNotice(t('compose.sent'));await loadFeed(spaces); }}/>
        : <p className="alert a-info"><strong>{t('closed.title')}</strong> {t('closed.home')}</p>}
      <section className="stack" aria-label={t('home.feed')}>
        <h2 className="kk">{t('home.feed')}</h2>
        {feed === null ? <Skeleton label={t('loading.home')} variant="page"/>
          : feed.length === 0 ? <div className="dashed"><p className="sm">{t('home.feedEmpty')}</p></div>
          : <ol className="feed">{feed.map(item => <Post key={item.post.id} post={item.post} space={{ id: item.space.id,name: item.space.name }} canReply={item.space.permissions.comment} joinToReply={item.space.membership !== 'JOINED' && item.space.permissions.join} onChange={replace} onGone={remove} onNotice={setNotice} onError={setFeedError}/>)}</ol>}
      </section>
    </div>

    <aside className="home-side">
      {joined.length > 0 && <section className="stack-sm">
        <h2 className="kk">{t('home.yourSpaces')}</h2>
        <ul className="mini-list">{joined.map(s => <MiniSpace key={s.id} space={s} note={t('home.joined')}/>)}</ul>
      </section>}
      {joined.length > 0 && others.length > 0 && <section className="stack-sm">
        <h2 className="kk">{t('home.otherSpaces')}</h2>
        <ul className="mini-list">{others.map(s => <MiniSpace key={s.id} space={s} note={reason(s)}/>)}</ul>
      </section>}
      {communityFlow && <section className="stack-sm">
        <div className="row-between"><h2 className="kk">{t('home.verified')}</h2><Link href="/discover" className="sm-link">{t('home.seeAll')}</Link></div>
        <div className="dashed"><strong className="serif">{t('home.noCommunities')}</strong><p className="sm">{t('home.noCommunities.p')}</p></div>
      </section>}
      <section className="side-card">
        <h2 className="q">{t('shell.boundaries')}</h2>
        <p className="sm">{t('shell.boundaries.p')}</p>
      </section>
    </aside>
  </div>;
}

function MiniSpace({ space,note }: { space: Space; note: string }) {
  return <li><Link href={`/spaces/${space.id}`} className="mini-space">
    <span className="mini-photo" style={{ backgroundImage: `url(${spacePhoto(space.id)})` }} aria-hidden="true"/>
    <span className="stack-xs"><strong className="serif">{space.name}</strong><span className="sm">{note}</span></span>
  </Link></li>;
}

export function SpaceCard({ space,note }: { space: Pick<Space,'id' | 'name'>; note: string }) {
  return <li><Link href={`/spaces/${space.id}`} className="sp">
    <span className="sp-img" style={{ backgroundImage: `url(${spacePhoto(space.id)})` }} aria-hidden="true"/>
    <span className="sp-body"><strong className="serif">{space.name}</strong><span className="sm">{note}</span></span>
  </Link></li>;
}

// First visit only (Home records the visit, so this never repeats): three short tips.
function Tips() {
  const { t } = useLang();
  const [n,setN] = useState(1),[open,setOpen] = useState(true);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[open]);
  if (!open) return null;
  const tips = [['tip.1.t','tip.1.p'],['tip.2.t','tip.2.p'],['tip.3.t','tip.3.p']] as const;
  const [title,text] = tips[n - 1]!;
  return <aside className="tip" aria-live="polite" aria-label={t('tip.of',{ n,total: 3 })}>
    <p className="kk">{t('tip.of',{ n,total: 3 })}</p>
    <strong className="serif">{t(title)}</strong>
    <p className="p">{t(text)}</p>
    <div className="row-between"><button type="button" className="ghost" onClick={() => setOpen(false)}>{t('tip.skip')}</button>
      {n < 3 ? <button type="button" className="btn small" onClick={() => setN(v => v + 1)}>{t('tip.next')}</button> : <button type="button" className="btn small" onClick={() => setOpen(false)}>{t('tip.done')}</button>}</div>
  </aside>;
}
