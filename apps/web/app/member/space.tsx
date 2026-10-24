'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Space, SpacePost } from '../../../../packages/contracts/src/spaces';
import { call, codeOf } from './client';
import { errorText, guidelines, reactions, reportReasons, timeAgo } from './copy';

export function SpacePage({ id }: { id: string }) {
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
    if (!window.confirm('Keluar dari ruang ini? Kamu bisa bergabung lagi kapan saja.')) return;
    const s = await call<Space>(`/spaces/${id}/leave`,{ method: 'POST',body: {} });
    setSpace(s);setPosts(null);setAgree(false);
  });
  const replace = (post: SpacePost) => setPosts(list => list?.map(p => p.id === post.id ? post : p) ?? null);
  const remove = (postId: string) => setPosts(list => list?.filter(p => p.id !== postId) ?? null);

  if (error && !space) return <div className="m-empty"><h1>{error === 'NOT_FOUND' ? 'Ruang ini nggak ditemukan.' : 'Belum bisa memuat ruang ini.'}</h1><p>{error === 'NOT_FOUND' ? 'Mungkin tautannya sudah lama.' : errorText(error)}</p><Link className="m-button" href="/home">Ke Beranda</Link></div>;
  if (!space) return <p className="m-loading" role="status">Memuat…</p>;

  const joined = space.membership === 'JOINED';
  return <div className="m-stack">
    <Link href="/home" className="m-text-link">← Beranda</Link>
    <section className="m-space-head">
      <p className="m-small">Ruang resmi Sandar · dikelola {space.operator}</p>
      <h1 className="m-title">{space.name}</h1>
      <p className="m-lead">{space.purpose}</p>
      <p className="m-small">Untuk: {space.audience}</p>
    </section>

    {error && <div className="m-error" role="alert">{errorText(error)}</div>}
    {notice && <div className="m-notice" role="status">{notice}</div>}

    {!joined ? <section className="m-panel">
      <h2 className="m-section">Aturan ruang ini</h2>
      <ol className="m-numbered">{guidelines.map(g => <li key={g}>{g}</li>)}</ol>
      {space.status !== 'ACTIVE' || !space.permissions.join
        ? <div className="m-callout">Ruang ini sedang tidak menerima anggota baru.</div>
        : <>
          <label className="m-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}/>Aku setuju dengan aturan ruang ini.</label>
          <button className="m-button" onClick={() => void join()} disabled={!agree || busy}>{busy ? 'Memproses…' : 'Gabung ruang'}</button>
        </>}
    </section> : <>
      <aside className="m-note">
        {space.permissions.post ? 'Kamu bisa berbagi di ruang ini.' : <><strong>Posting belum dibuka.</strong> Kamu bisa baca dan kasih reaksi. Kami kabari lewat email begitu posting dibuka.</>}
      </aside>
      <section aria-label="Postingan">
        {posts === null ? <p className="m-loading" role="status">Memuat postingan…</p>
          : posts.length === 0 ? <div className="m-empty small"><h2>Belum ada postingan.</h2><p>Ruang ini baru dibuka. Mampir lagi nanti ya.</p></div>
          : <ol className="m-feed">{posts.map(p => <Post key={p.id} post={p} onChange={replace} onGone={remove} onNotice={setNotice} onError={setError}/>)}</ol>}
      </section>
      <button className="m-text" onClick={() => void leave()} disabled={busy}>Keluar dari ruang ini</button>
    </>}
  </div>;
}

function Post({ post,onChange,onGone,onNotice,onError }: { post: SpacePost; onChange: (p: SpacePost) => void; onGone: (id: string) => void; onNotice: (text: string) => void; onError: (code: string) => void }) {
  const [busy,setBusy] = useState<string | null>(null),[menu,setMenu] = useState(false),[reason,setReason] = useState<string>('');
  const announcement = post.identityMode === 'ANNOUNCEMENT';
  const author = announcement ? 'Tim Sandar' : post.identityMode === 'ANONYMOUS' ? 'Anonim' : post.authorName;

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
    try { await call(`/space-posts/${post.id}/report`,{ method: 'POST',body: { reason } });setMenu(false);onNotice('Terima kasih. Laporanmu sudah dikirim ke tim keamanan. Identitasmu sebagai pelapor nggak akan dibagikan.'); }
    catch (e) { onError(codeOf(e)); } finally { setBusy(null); }
  }
  async function block() {
    if (!window.confirm('Blokir penulis ini? Kamu nggak akan melihat postingannya lagi, dan dia nggak akan tahu.')) return;
    setBusy('block');
    try { await call(`/space-posts/${post.id}/block-author`,{ method: 'POST',body: {} });onGone(post.id);onNotice('Penulis diblokir. Postingannya nggak akan muncul lagi.'); }
    catch (e) { onError(codeOf(e)); } finally { setBusy(null); }
  }

  return <li className={announcement ? 'm-post announcement' : 'm-post'}>
    <p className="m-post-meta"><strong>{author}</strong> · {timeAgo(post.createdAt)}</p>
    <p className="m-post-body">{post.body}</p>
    <div className="m-reactions">
      {reactions.map(r => {
        const selected = post.reactions.find(x => x.type === r.type)?.selected ?? false;
        return <button key={r.type} type="button" className={selected ? 'm-react on' : 'm-react'} aria-pressed={selected} disabled={busy !== null} onClick={() => void toggle(r.type,selected)}>{r.label}</button>;
      })}
      {!post.own && !announcement && <button type="button" className="m-text m-more" aria-expanded={menu} onClick={() => setMenu(m => !m)}>Laporkan</button>}
    </div>
    {menu && <div className="m-report">
      <label className="m-field">Kenapa kamu melaporkan ini?<select value={reason} onChange={e => setReason(e.target.value)}>
        <option value="">Pilih alasan</option>{reportReasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select></label>
      <div className="m-row">
        <button className="m-button small" onClick={() => void report()} disabled={!reason || busy !== null}>Kirim laporan</button>
        {post.canBlock && <button className="m-button small secondary" onClick={() => void block()} disabled={busy !== null}>Blokir penulis</button>}
        <button className="m-text" onClick={() => setMenu(false)}>Batal</button>
      </div>
    </div>}
  </li>;
}
