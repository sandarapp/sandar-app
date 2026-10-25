'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Space, SpacePost } from '../../../../packages/contracts/src/spaces';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, reactionTypes, reportReasons, ruleKeys, spacePhoto, timeAgo } from './copy';

export function SpacePage({ id }: { id: string }) {
  const { t } = useLang();
  const [space,setSpace] = useState<Space | null>(null),[posts,setPosts] = useState<SpacePost[] | null>(null);
  const [error,setError] = useState(''),[busy,setBusy] = useState(false),[agree,setAgree] = useState(false),[notice,setNotice] = useState('');

  const loadPosts = useCallback(async (s: Space) => {
    if (!s.permissions.read) return setPosts(null);
    setPosts(await call<SpacePost[]>(`/spaces/${s.id}/posts`));
    void call('/home/context',{ method: 'POST',body: { spaceId: s.id } }).catch(() => {});
  },[]);
  const load = useCallback(async () => {
    setError('');
    try { const s = await call<Space>(`/spaces/${id}`);setSpace(s);await loadPosts(s); }
    catch (e) { setError(codeOf(e)); }
  },[id,loadPosts]);
  useEffect(() => { void load(); },[load]);

  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);setError('');setNotice('');
    try { await work(); } catch (e) { setError(codeOf(e)); } finally { setBusy(false); }
  }
  const join = () => act(async () => {
    const s = await call<Space>(`/spaces/${id}/join`,{ method: 'POST',body: { accepted: true,guidelinesVersion: space!.guidelinesVersion } });
    setSpace(s);await loadPosts(s);
  });
  const leave = () => act(async () => {
    if (!window.confirm(t('space.leaveConfirm'))) return;
    const s = await call<Space>(`/spaces/${id}/leave`,{ method: 'POST',body: {} });
    setSpace(s);setPosts(null);setAgree(false);
  });
  const replace = (post: SpacePost) => setPosts(list => list?.map(p => p.id === post.id ? post : p) ?? null);
  const remove = (postId: string) => setPosts(list => list?.filter(p => p.id !== postId) ?? null);

  if (error && !space) return <div className="empty"><h1 className="h serif">{error === 'NOT_FOUND' ? t('space.notFound') : t('space.loadFail')}</h1><p className="p">{error === 'NOT_FOUND' ? t('space.notFound.p') : t(errorKey(error))}</p><Link className="btn" href="/home">{t('common.toHome')}</Link></div>;
  if (!space) return <p className="loading" role="status">{t('common.loading')}</p>;

  const joined = space.membership === 'JOINED';
  const rules = <ol className="rules">{ruleKeys.map(key => <li key={key}>{t(key)}</li>)}</ol>;
  return <div className="with-side">
    <div className="stack-lg">
      <Link href="/home" className="sm-link">{t('space.back')}</Link>
      <header className="space-head">
        <span className="space-photo" style={{ backgroundImage: `url(${spacePhoto(space.id)})` }} aria-hidden="true"/>
        <div className="stack-sm">
          <p className="kk">{t('space.meta',{ operator: space.operator })}</p>
          <h1 className="display serif">{space.name}</h1>
          <p className="p">{space.purpose}</p>
          <p className="sm">{t('space.for',{ audience: space.audience })}</p>
        </div>
      </header>

      {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
      {notice && <p className="alert a-ok" role="status">{notice}</p>}

      {!joined ? <section className="panel stack">
        <h2 className="h3 serif">{t('space.rules')}</h2>
        {rules}
        {space.status !== 'ACTIVE' || !space.permissions.join
          ? <p className="alert a-warn">{t('space.closedToNew')}</p>
          : <>
            <label className="check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}/><span>{t('space.agree')}</span></label>
            <button className="btn fit" onClick={() => void join()} disabled={!agree || busy}>{busy ? t('common.working') : t('space.join')}</button>
          </>}
      </section> : <>
        <p className="alert a-info">{space.permissions.post ? t('space.canPost') : <><strong>{t('closed.title')}</strong> {t('closed.space')}</>}</p>
        <section aria-label={t('space.posts')}>
          {posts === null ? <p className="loading" role="status">{t('space.loadingPosts')}</p>
            : posts.length === 0 ? <div className="dashed"><strong className="serif">{t('space.noPosts')}</strong><p className="sm">{t('space.noPosts.p')}</p></div>
            : <ol className="feed">{posts.map(p => <Post key={p.id} post={p} onChange={replace} onGone={remove} onNotice={setNotice} onError={setError}/>)}</ol>}
        </section>
        <button className="link-button" onClick={() => void leave()} disabled={busy}>{t('space.leave')}</button>
      </>}
    </div>
    <aside className="side-card stack">
      <h2 className="q">{t('space.about')}</h2>
      <p className="sm">{t('space.about.p')}</p>
      {joined && <><h2 className="q">{t('space.rules')}</h2>{rules}</>}
    </aside>
  </div>;
}

function Post({ post,onChange,onGone,onNotice,onError }: { post: SpacePost; onChange: (p: SpacePost) => void; onGone: (id: string) => void; onNotice: (text: string) => void; onError: (code: string) => void }) {
  const { lang,t } = useLang();
  const [busy,setBusy] = useState<string | null>(null),[panel,setPanel] = useState(false),[reason,setReason] = useState('');
  useEffect(() => {
    if (!panel) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(false); };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[panel]);
  const announcement = post.identityMode === 'ANNOUNCEMENT';
  const author = announcement ? t('post.team') : post.identityMode === 'ANONYMOUS' ? t('post.anonymous') : post.authorName;

  async function toggle(type: string,selected: boolean) {
    if (busy) return;
    setBusy(type);
    try {
      onChange(selected
        ? await call<SpacePost>(`/space-posts/${post.id}/reactions/${type}`,{ method: 'DELETE' })
        : await call<SpacePost>(`/space-posts/${post.id}/reactions`,{ method: 'POST',body: { type } }));
    } catch (e) { const code = codeOf(e);if (code === 'CONTENT_REMOVED') onGone(post.id);onError(code); }
    finally { setBusy(null); }
  }
  async function report() {
    if (!reason) return;
    setBusy('report');
    try { await call(`/space-posts/${post.id}/report`,{ method: 'POST',body: { reason } });setPanel(false);onNotice(t('report.done')); }
    catch (e) { onError(codeOf(e)); } finally { setBusy(null); }
  }
  async function block() {
    if (!window.confirm(t('block.confirm'))) return;
    setBusy('block');
    try { await call(`/space-posts/${post.id}/block-author`,{ method: 'POST',body: {} });onGone(post.id);onNotice(t('block.done')); }
    catch (e) { onError(codeOf(e)); } finally { setBusy(null); }
  }

  return <li className={announcement ? 'post announcement' : 'post'}>
    <div className="who"><span className="pa" aria-hidden="true"/><div><strong>{author}</strong><p className="sm">{timeAgo(post.createdAt,lang,t)}</p></div></div>
    <p className="p">{post.body}</p>
    <div className="acts" role="group" aria-label={t('post.reactions')}>
      {reactionTypes.map(type => {
        const selected = post.reactions.find(x => x.type === type)?.selected ?? false;
        return <button key={type} type="button" className={selected ? 'react on' : 'react'} aria-pressed={selected} disabled={busy !== null} onClick={() => void toggle(type,selected)}>{t(`react.${type}`)}</button>;
      })}
      {!post.own && !announcement && <button type="button" className="react quiet" aria-expanded={panel} onClick={() => setPanel(true)}>{t('report.open')}</button>}
    </div>
    {panel && <div className="scrim side" onClick={() => setPanel(false)}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={`report-${post.id}`} onClick={event => event.stopPropagation()}>
        <h2 id={`report-${post.id}`} className="h3 serif">{t('report.title')}</h2>
        <p className="sm">{t('report.sub')}</p>
        <fieldset className="radios"><legend className="visually-hidden">{t('report.reason')}</legend>
          {reportReasons.map(value => <label key={value} className="rad"><input type="radio" name={`reason-${post.id}`} value={value} checked={reason === value} onChange={() => setReason(value)}/>{t(`report.${value}`)}</label>)}
        </fieldset>
        <p className="alert a-warn">{t('report.warn')}</p>
        <div className="modal-actions">
          {post.canBlock && <button className="btn2" onClick={() => void block()} disabled={busy !== null}>{t('report.block')}</button>}
          <button className="btn" onClick={() => void report()} disabled={!reason || busy !== null}>{t('report.send')}</button>
        </div>
        <button className="ghost fit" onClick={() => setPanel(false)}>{t('common.cancel')}</button>
      </div>
    </div>}
  </li>;
}
