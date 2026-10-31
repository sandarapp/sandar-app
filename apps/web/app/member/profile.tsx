'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { MemberProfile } from '../../../../packages/contracts/src/member';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, timeAgo } from './copy';
import { MoodHistory } from './mood';
import { Avatar, SafetyModal, Skeleton } from './ui';

// WA-08b: how other members see you. How Sandar works for you lives in Settings.
export function Profile() {
  const { lang,t } = useLang();
  const [profile,setProfile] = useState<MemberProfile | null>(null),[privacy,setPrivacy] = useState<OnboardingState['privacy']>(null),[error,setError] = useState(''),[editing,setEditing] = useState(false),[name,setName] = useState(''),[bio,setBio] = useState(''),[busy,setBusy] = useState(false),[safety,setSafety] = useState(false);
  const [tab,setTab] = useState<'posts' | 'spaces'>('posts');
  const load = useCallback(async () => {
    setError('');
    try { const [p,o] = await Promise.all([call<MemberProfile>('/me/profile'),call<OnboardingState>('/users/me/onboarding')]);setProfile(p);setPrivacy(o.privacy);setName(p.displayName);setBio(p.bio); }
    catch (e) { setError(codeOf(e)); }
  },[]);
  useEffect(() => { void load(); },[load]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !profile) return;
    setBusy(true);setError('');
    try {
      if (bio.trim() !== profile.bio) await call('/me/profile',{ method: 'PATCH',body: { bio: bio.trim() } });
      if (name.trim() !== profile.displayName && privacy) await call('/settings/privacy',{ method: 'PATCH',body: { ...privacy,displayName: name.trim() } });
      setEditing(false);await load();
    } catch (e) { const code = codeOf(e);if (code === 'SELF_HARM_SUPPORT') setSafety(true);else setError(code); }
    finally { setBusy(false); }
  };
  if (!profile) return error ? <div className="empty"><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div> : <Skeleton label={t('loading.page')} variant="page"/>;
  const joined = new Date(profile.joinedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID',{ month: 'long',year: 'numeric' });
  return <div className="stack-lg narrow wide-ish">
    <section className="set-card stack">
      <div className="profile-head">
        <Avatar name={profile.displayName} seed={profile.displayName} size={72}/>
        {editing ? <form className="stack-sm grow" onSubmit={save}>
          <label className="lbl">{t('profile.displayName')}<input className="in" value={name} maxLength={80} onChange={e => setName(e.target.value)} disabled={busy}/><span className="hint">{t('set.nameNote')}</span></label>
          <label className="lbl">{t('prof.bio')}<input className="in" value={bio} maxLength={160} onChange={e => setBio(e.target.value)} disabled={busy}/></label>
          <div className="chips"><button className="btn small" type="submit" disabled={busy || !name.trim()}>{t('set.saveName')}</button><button type="button" className="ghost" onClick={() => { setEditing(false);setName(profile.displayName);setBio(profile.bio); }}>{t('common.cancel')}</button></div>
        </form> : <div className="stack-xs grow">
          <h1 className="h serif">{profile.displayName}</h1>
          {profile.bio && <p className="p">{profile.bio}</p>}
          <p className="sm">{t('prof.meta',{ when: joined,n: profile.spaces.length })}</p>
        </div>}
        {!editing && <button type="button" className="btn2" onClick={() => setEditing(true)}>{t('prof.edit')}</button>}
      </div>
      {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
      <p className="sm">{t('prof.private')}</p>
    </section>
    <MoodHistory/>
    <div className="chips" role="group"><button type="button" className={tab === 'posts' ? 'chip on' : 'chip'} aria-pressed={tab === 'posts'} onClick={() => setTab('posts')}>{t('prof.posts')}</button><button type="button" className={tab === 'spaces' ? 'chip on' : 'chip'} aria-pressed={tab === 'spaces'} onClick={() => setTab('spaces')}>{t('nav.mine')}</button></div>
    {tab === 'posts' ? (profile.posts.length ? <ul className="mini-list">{profile.posts.map(p => <li key={p.id} className="set-card stack-sm">
      <p className="sm">{p.identityMode === 'ANONYMOUS' ? t('prof.anon') : profile.displayName} · <Link href={`/spaces/${p.spaceId}`} className="sm-link">{p.spaceName}</Link> · {timeAgo(p.createdAt,lang,t)}</p>
      <p className="p">{p.body}</p>
      {p.commentCount > 0 && <p className="sm">{p.commentCount === 1 ? t('reply.one') : t('reply.count',{ n: p.commentCount })}</p>}
    </li>)}</ul> : <div className="dashed"><p className="sm">{t('prof.noPosts')}</p></div>)
      : profile.spaces.length ? <ul className="mini-list">{profile.spaces.map(s => <li key={s.id}><Link className="sm-link" href={`/spaces/${s.id}`}>{s.name}</Link></li>)}</ul> : <div className="dashed"><p className="sm">{t('mine.empty.p')}</p></div>}
    {safety && <SafetyModal onClose={() => setSafety(false)}/>}
  </div>;
}
