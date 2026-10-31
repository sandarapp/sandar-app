'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import type { Space, SpaceComment, SpacePost } from '../../../../packages/contracts/src/spaces';
import { useLang } from '../i18n';
import { HelpButton } from './help';
import { Avatar, SafetyModal, Skeleton } from './ui';
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
  if (!space) return <Skeleton label={t('loading.page')}/>;

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
        {space.permissions.post ? <Composer spaces={[space]} onSent={async () => { setNotice(t('compose.sent'));await loadPosts(space); }}/> : <p className="alert a-info"><strong>{t('closed.title')}</strong> {t('closed.space')}</p>}
        <section aria-label={t('space.posts')}>
          {posts === null ? <Skeleton label={t('space.loadingPosts')} variant="page"/>
            : posts.length === 0 ? <div className="dashed"><strong className="serif">{t('space.noPosts')}</strong><p className="sm">{t('space.noPosts.p')}</p></div>
            : <ol className="feed">{posts.map(p => <Post key={p.id} post={p} canReply={space.permissions.comment} onChange={replace} onGone={remove} onNotice={setNotice} onError={setError}/>)}</ol>}
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

/** The member's display name, for "Replying as" and the composer header. */
export function useDisplayName() {
  const [name,setName] = useState<string | null>(null);
  useEffect(() => { call<OnboardingState>('/users/me/onboarding').then(o => setName(o.privacy?.displayName ?? null)).catch(() => {}); },[]);
  return name;
}

export function Post({ post,space,canReply,onChange,onGone,onNotice,onError }: { post: SpacePost; space?: { id: string; name: string }; canReply: boolean; onChange: (p: SpacePost) => void; onGone: (id: string) => void; onNotice: (text: string) => void; onError: (code: string) => void }) {
  const { lang,t } = useLang();
  const [busy,setBusy] = useState<string | null>(null),[panel,setPanel] = useState(false),[reason,setReason] = useState(''),[thread,setThread] = useState(false);
  useEffect(() => {
    if (!panel) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(false); };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[panel]);
  const announcement = post.identityMode === 'ANNOUNCEMENT',pending = post.status === 'PENDING_REVIEW',anonymous = post.identityMode === 'ANONYMOUS';
  const author = announcement ? t('post.team') : anonymous ? t('post.anonymous') : post.authorName;

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

  return <li className={announcement ? 'post announcement' : pending ? 'post pending' : 'post'}>
    <Avatar name={anonymous ? null : author} seed={anonymous ? post.id : author}/>
    <div className="post-body">
      <p className="post-head"><b>{author}</b>{announcement && <span className="chip-tag team">Sandar</span>}{space && <Link href={`/spaces/${space.id}`} className="chip-tag">{space.name}</Link>}<span className="tm">{timeAgo(post.createdAt,lang,t)}</span></p>
      {pending && <p className="sm"><span className="tag-review">{t('post.pending')}</span> {t('post.pending.p')}</p>}
      <p className="txt">{post.body}</p>
      {!pending && <div className="acts" role="group" aria-label={t('post.reactions')}>
        {reactionTypes.map(type => {
          const selected = post.reactions.find(x => x.type === type)?.selected ?? false;
          return <button key={type} type="button" className={selected ? 'ac on' : 'ac'} aria-pressed={selected} disabled={busy !== null} onClick={() => void toggle(type,selected)}>{type === 'RELATE' ? '♡ ' : ''}{t(`react.${type}`)}</button>;
        })}
        {(canReply || post.commentCount > 0) && <button type="button" className={thread ? 'ac on' : 'ac'} aria-expanded={thread} onClick={() => setThread(v => !v)}>{post.commentCount === 1 ? t('reply.one') : post.commentCount > 1 ? t('reply.count',{ n: post.commentCount }) : t('reply.open')}</button>}
        {!post.own && !announcement && <button type="button" className="ac quiet" aria-expanded={panel} onClick={() => setPanel(true)}>{t('report.open')}</button>}
      </div>}
      {thread && <Replies post={post} canReply={canReply} onCount={n => onChange({ ...post,commentCount: n })} onNotice={onNotice}/>}
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

// Replies are one level deep. The request id is kept for retries of the same text.
function Replies({ post,canReply,onCount,onNotice }: { post: SpacePost; canReply: boolean; onCount: (n: number) => void; onNotice: (text: string) => void }) {
  const { lang,t } = useLang();
  const me = useDisplayName();
  const [list,setList] = useState<SpaceComment[] | null>(null),[body,setBody] = useState(''),[busy,setBusy] = useState(false),[error,setError] = useState(''),[safety,setSafety] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const load = useCallback(async () => {
    try { const rows = await call<SpaceComment[]>(`/space-posts/${post.id}/comments`);setList(rows);return rows; }
    catch (e) { setError(codeOf(e));return null; }
  },[post.id]);
  useEffect(() => { void load(); },[load]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);setError('');
    try {
      await call(`/space-posts/${post.id}/comments`,{ method: 'POST',body: { requestId: requestId.current,body: body.trim() } });
      requestId.current = crypto.randomUUID();setBody('');
      const rows = await load();if (rows) onCount(rows.length);
    } catch (e) { const code = codeOf(e);if (code === 'SELF_HARM_SUPPORT') setSafety(true);else setError(code); }
    finally { setBusy(false); }
  };
  const report = async (id: string) => {
    try { await call(`/space-comments/${id}/report`,{ method: 'POST',body: { reason: 'OTHER' } });onNotice(t('report.done')); } catch (e) { setError(codeOf(e)); }
  };
  return <div className="thread" aria-label={t('reply.label')}>
    {list === null && !error && <Skeleton label={t('loading.page')} variant="page"/>}
    {list?.length === 0 && <p className="sm">{t('reply.empty')}</p>}
    {list && list.length > 0 && <ol className="replies">{list.map(c => <li key={c.id} className="reply">
      <Avatar name={c.authorName} seed={c.authorName} size={28}/>
      <div><p className="post-head"><b>{c.authorName}</b><span className="tm">{timeAgo(c.createdAt,lang,t)}</span></p><p className="txt">{c.body}</p>
        {!c.own && <button type="button" className="ac quiet small" onClick={() => void report(c.id)}>{t('report.open')}</button>}</div>
    </li>)}</ol>}
    {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
    {canReply && <form className="reply-box" onSubmit={send}>
      <Avatar name={me} seed={me ?? 'me'} size={28}/>
      <label className="visually-hidden" htmlFor={`reply-${post.id}`}>{t('reply.placeholder')}</label>
      <input id={`reply-${post.id}`} className="in" value={body} maxLength={1000} placeholder={me ? t('reply.as',{ name: me }) : t('reply.placeholder')} onChange={e => { setBody(e.target.value);requestId.current = crypto.randomUUID(); }} disabled={busy}/>
      <button className="btn small" type="submit" disabled={busy || !body.trim()}>{t('reply.send')}</button>
    </form>}
    {safety && <SafetyModal onClose={() => setSafety(false)}/>}
  </div>;
}

// "Share what's on your mind" opens the composer as a modal over the feed (WA-04b).
// The request id stays the same until a post is accepted, so a retried submit
// never creates a second post.
export function Composer({ spaces,onSent }: { spaces: Space[]; onSent: () => Promise<void> }) {
  const { t } = useLang();
  const me = useDisplayName();
  const [open,setOpen] = useState(false);
  if (!spaces.length) return null;
  return <>
    <div className="quick">
      <Avatar name={me} seed={me ?? 'me'}/>
      <button type="button" className="quick-open" onClick={() => setOpen(true)}>{t('compose.label')}</button>
      <button type="button" className="btn" onClick={() => setOpen(true)}>{t('compose.submit')}</button>
    </div>
    {open && <ComposerModal spaces={spaces} me={me} onClose={() => setOpen(false)} onSent={async () => { setOpen(false);await onSent(); }}/>}
  </>;
}

function ComposerModal({ spaces,me,onClose,onSent }: { spaces: Space[]; me: string | null; onClose: () => void; onSent: () => Promise<void> }) {
  const { t } = useLang();
  const [body,setBody] = useState(''),[anonymous,setAnonymous] = useState(false),[busy,setBusy] = useState(false),[error,setError] = useState(''),[safety,setSafety] = useState(false);
  const [chosen,setChosen] = useState(spaces.length === 1 ? spaces[0]!.id : ''),[picker,setPicker] = useState(false);
  const space = spaces.find(s => s.id === chosen);
  const requestId = useRef(crypto.randomUUID());
  const area = useRef<HTMLTextAreaElement>(null);
  const close = useCallback(() => { if (!body.trim() || window.confirm(t('compose.discard'))) onClose(); },[body,onClose,t]);
  useEffect(() => {
    area.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !safety) { if (picker) setPicker(false);else close(); } };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[close,picker,safety]);
  const send = async () => {
    if (busy || !body.trim() || !space) return;
    setBusy(true);setError('');
    try {
      await call(`/spaces/${space.id}/posts`,{ method: 'POST',body: { requestId: requestId.current,identityMode: anonymous ? 'ANONYMOUS' : 'PROFILE',body: body.trim() } });
      requestId.current = crypto.randomUUID();
      await onSent();
    } catch (e) { const code = codeOf(e);if (code === 'SELF_HARM_SUPPORT') setSafety(true);else setError(code); }
    finally { setBusy(false); }
  };
  const anonymousAllowed = space ? space.permissions.anonymous : spaces.some(s => s.permissions.anonymous);
  return <div className="scrim compose-scrim" onClick={close}>
    <div className="modal composer-modal" role="dialog" aria-modal="true" aria-labelledby="compose-title" onClick={event => event.stopPropagation()}>
      <div className="mh"><button type="button" className="ghost" onClick={close}>{t('common.cancel')}</button><h2 id="compose-title" className="serif">{t('compose.new')}</h2><span/></div>
      <div className="mb">
        <Avatar name={anonymous ? null : me} seed={anonymous ? 'anonymous' : me ?? 'me'} size={44}/>
        <div className="stack-sm">
          <div className="who-line"><b>{anonymous ? t('compose.anonName') : me ?? ''}</b><span aria-hidden="true">›</span>
            <span className="picker">
              <button type="button" className={space ? 'space-chip set' : 'space-chip'} aria-haspopup="listbox" aria-expanded={picker} onClick={() => setPicker(v => !v)} disabled={spaces.length === 1}>{space?.name ?? t('compose.chooseSpace')}{spaces.length > 1 && <span aria-hidden="true"> ▾</span>}</button>
              {picker && <ul className="pop" role="listbox" aria-label={t('compose.chooseSpace')}>{spaces.map(s => <li key={s.id} role="option" aria-selected={s.id === chosen}>
                <button type="button" onClick={() => { setChosen(s.id);setPicker(false);requestId.current = crypto.randomUUID(); }}><span>{s.name}</span>{s.id === chosen && <span aria-hidden="true">✓</span>}</button>
              </li>)}</ul>}
            </span>
          </div>
          <label className="visually-hidden" htmlFor="compose-body">{t('compose.label')}</label>
          <textarea ref={area} id="compose-body" className="ta" value={body} maxLength={1000} rows={5} placeholder={t('compose.placeholder')} onChange={e => { setBody(e.target.value);requestId.current = crypto.randomUUID(); }} disabled={busy}/>
          {anonymousAllowed && <div className="tools"><button type="button" className={anonymous ? 'tool on' : 'tool'} aria-pressed={anonymous} onClick={() => setAnonymous(v => !v)} disabled={busy}>{t('compose.anon')}</button></div>}
        </div>
      </div>
      {error && <p className="alert a-err modal-error" role="alert">{t(errorKey(error))}</p>}
      <div className="mf"><p className="sm">{t('compose.review')}</p><span className="count">{t('compose.count',{ n: body.length })}</span><button type="button" className="btn" onClick={() => void send()} disabled={busy || !body.trim() || !space}>{busy ? t('common.working') : t('compose.submit')}</button></div>
      <p className="sm mf-help">{t('compose.crisis')} <HelpButton/></p>
    </div>
    {safety && <SafetyModal onClose={() => { setSafety(false);area.current?.focus(); }}/>}
  </div>;
}
