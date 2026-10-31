'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { participationPreferences, supportInterests, type OnboardingState } from '../../../../packages/contracts/src/onboarding';
import type { BlockedMember } from '../../../../packages/contracts/src/settings';
import { selectInterest } from '../../../../packages/auth-client/src/onboarding-flow';
import { apiLocale, useLang, type Lang } from '../i18n';
import { call, codeOf, memberClient } from './client';
import { errorKey, label } from './copy';
import { Skeleton } from './ui';

const CONTACT = 'hellosandar@zohomail.com';
const sections = ['account','profile','preferences','language','blocked','data'] as const;
type Section = typeof sections[number];
type Privacy = NonNullable<OnboardingState['privacy']>;
type Preferences = NonNullable<OnboardingState['preferences']>;
type Location = NonNullable<OnboardingState['location']>;

// WA-08. Each change saves on its own and confirms it; a failed save restores
// the previous value and says why.
export function Settings() {
  const { t } = useLang();
  const [section,setSection] = useState<Section>('account');
  const [email,setEmail] = useState(''),[state,setState] = useState<OnboardingState | null>(null),[error,setError] = useState(''),[toast,setToast] = useState(''),[leaving,setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const load = useCallback(async () => {
    setError('');
    try {
      const [me,o] = await Promise.all([call<{ email: string }>('/users/me'),call<OnboardingState>('/users/me/onboarding')]);
      setEmail(me.email);setState(o);
    } catch (e) { setError(codeOf(e)); }
  },[]);
  useEffect(() => { void load(); },[load]);
  const done = useCallback((message: string) => {
    setError('');setToast(message);clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''),3000);
    // Other sections build their next save from this state, so it must stay current.
    void load();
  },[load]);
  const logout = async () => {
    setLeaving(true);
    try { await memberClient().logout(); } catch { /* The server clears the cookie; go to login either way. */ }
    window.location.assign('/login');
  };
  if (!state) return error ? <div className="empty"><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div> : <Skeleton label={t('loading.page')} variant="page"/>;
  const shared = { onSaved: done,onError: (code: string) => { setToast('');setError(code); } };
  return <div className="settings">
    <nav className="settings-nav" aria-label={t('set.title')}>
      <p className="kk">{t('set.kicker')}</p>
      {sections.map(s => <button key={s} type="button" className={section === s ? 'set-item on' : 'set-item'} aria-current={section === s ? 'page' : undefined} onClick={() => { setSection(s);setError('');setToast(''); }}>{t(`set.nav.${s}`)}</button>)}
      <button type="button" className="set-item" onClick={() => void logout()} disabled={leaving}>{t('common.logout')}</button>
    </nav>
    <div className="settings-main stack">
      <h1 className="h">{t(`set.nav.${section}`)}</h1>
      {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
      {toast && <p className="alert a-ok" role="status">{toast}</p>}
      {section === 'account' && <Account email={email} {...shared}/>}
      {section === 'profile' && state.privacy && <Profile initial={state.privacy} {...shared}/>}
      {section === 'preferences' && <PreferencesForm initial={state.preferences ?? { needs: [],goals: [],communityType: 'NO_PREFERENCE' }} {...shared}/>}
      {section === 'language' && state.privacy && <LanguageRegion privacy={state.privacy} location={state.location} {...shared}/>}
      {section === 'blocked' && <Blocked {...shared}/>}
      {section === 'data' && <DataRights/>}
    </div>
  </div>;
}

interface Shared { onSaved: (message: string) => void; onError: (code: string) => void }

function Account({ email,onSaved,onError }: { email: string } & Shared) {
  const { t } = useLang();
  const [current,setCurrent] = useState(''),[next,setNext] = useState(''),[confirm,setConfirm] = useState(''),[busy,setBusy] = useState(false);
  const change = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await call('/settings/password',{ method: 'POST',body: { currentPassword: current,newPassword: next } });
      setCurrent('');setNext('');setConfirm('');onSaved(t('set.passwordSaved'));
    } catch (e) { onError(codeOf(e)); } finally { setBusy(false); }
  };
  const others = async () => {
    if (busy || !window.confirm(t('set.othersConfirm'))) return;
    setBusy(true);
    try { await call('/settings/sessions/revoke-others',{ method: 'POST',body: {} });onSaved(t('set.othersDone')); }
    catch (e) { onError(codeOf(e)); } finally { setBusy(false); }
  };
  return <>
    <section className="set-card"><h2 className="q">{t('auth.email')}</h2><p className="p">{email}</p><p className="sm">{t('set.emailNote')}</p></section>
    <form className="set-card stack" onSubmit={change}>
      <h2 className="q">{t('auth.password')}</h2>
      <label className="lbl">{t('set.currentPassword')}<input className="in" type="password" autoComplete="current-password" value={current} maxLength={128} onChange={e => setCurrent(e.target.value)} disabled={busy}/></label>
      <label className="lbl">{t('auth.newPassword')}<input className="in" type="password" autoComplete="new-password" value={next} maxLength={128} onChange={e => setNext(e.target.value)} disabled={busy}/><span className="hint">{t('auth.passwordHint')}</span></label>
      <label className="lbl">{t('auth.confirm')}<input className="in" type="password" autoComplete="new-password" value={confirm} maxLength={128} onChange={e => setConfirm(e.target.value)} disabled={busy}/>{confirm && next !== confirm && <span className="fe">{t('auth.mismatch')}</span>}</label>
      <button className="btn fit" type="submit" disabled={busy || !current || next.length < 12 || next !== confirm}>{t('set.changePassword')}</button>
    </form>
    <section className="set-card stack"><h2 className="q">{t('set.others')}</h2><p className="sm">{t('set.othersNote')}</p><button type="button" className="btn2 fit" onClick={() => void others()} disabled={busy}>{t('set.othersAction')}</button></section>
  </>;
}

function Profile({ initial,onSaved,onError }: { initial: Privacy } & Shared) {
  const { t } = useLang();
  const [value,setValue] = useState(initial),[name,setName] = useState(initial.displayName),[busy,setBusy] = useState(false);
  const save = async (next: Privacy) => {
    if (busy) return;
    const previous = value;
    setValue(next);setBusy(true);
    try { await call('/settings/privacy',{ method: 'PATCH',body: next });onSaved(t('set.saved')); }
    catch (e) { setValue(previous);setName(previous.displayName);onError(codeOf(e)); }
    finally { setBusy(false); }
  };
  return <>
    <form className="set-card stack" onSubmit={event => { event.preventDefault();if (name.trim() && name.trim() !== value.displayName) void save({ ...value,displayName: name.trim() }); }}>
      <label className="lbl">{t('profile.displayName')}<input className="in" value={name} maxLength={80} autoComplete="nickname" onChange={e => setName(e.target.value)} disabled={busy}/><span className="hint">{t('set.nameNote')}</span></label>
      <button className="btn fit" type="submit" disabled={busy || !name.trim() || name.trim() === value.displayName}>{t('set.saveName')}</button>
    </form>
    <section className="set-card">
      <Switch on={value.allowAnonymousPosting} busy={busy} onChange={on => void save({ ...value,allowAnonymousPosting: on })} title={t('onb.privacy.anon')} note={t('set.anonNote')}/>
      <Switch on={value.profileVisibility === 'MEMBERS'} busy={busy} onChange={on => void save({ ...value,profileVisibility: on ? 'MEMBERS' : 'HIDDEN' })} title={t('onb.privacy.profile')}/>
      <Switch on={value.directoryVisibility === 'DISPLAY_NAME'} busy={busy} onChange={on => void save({ ...value,directoryVisibility: on ? 'DISPLAY_NAME' : 'HIDDEN' })} title={t('onb.privacy.directory')}/>
    </section>
  </>;
}

function Switch({ on,busy,onChange,title,note }: { on: boolean; busy: boolean; onChange: (on: boolean) => void; title: string; note?: string }) {
  return <label className="toggle"><span className="stack-xs"><span>{title}</span>{note && <span className="sm">{note}</span>}</span><input type="checkbox" role="switch" checked={on} disabled={busy} onChange={e => onChange(e.target.checked)}/></label>;
}

function PreferencesForm({ initial,onSaved,onError }: { initial: Preferences } & Shared) {
  const { lang,t } = useLang();
  const [value,setValue] = useState(initial),[busy,setBusy] = useState(false);
  const save = async (next: Preferences) => {
    if (busy) return;
    const previous = value;
    setValue(next);setBusy(true);
    try { await call('/settings/preferences',{ method: 'PATCH',body: next });onSaved(t('set.saved')); }
    catch (e) { setValue(previous);onError(codeOf(e)); }
    finally { setBusy(false); }
  };
  const formats: Preferences['communityType'][] = ['ONLINE','LOCAL','MIXED','NO_PREFERENCE'];
  return <>
    <section className="set-card stack"><h2 className="q">{t('onb.review.topics')}</h2><div className="chips">{supportInterests.map(v => <button key={v} type="button" className={value.needs.includes(v) ? 'chip on' : 'chip'} aria-pressed={value.needs.includes(v)} disabled={busy} onClick={() => void save({ ...value,needs: selectInterest(value.needs as typeof supportInterests[number][],v) })}>{label(lang,v)}</button>)}</div></section>
    <section className="set-card stack"><h2 className="q">{t('onb.review.part')}</h2><div className="chips">{participationPreferences.map(v => <button key={v} type="button" className={value.goals.includes(v) ? 'chip on' : 'chip'} aria-pressed={value.goals.includes(v)} disabled={busy} onClick={() => void save({ ...value,goals: value.goals.includes(v) ? value.goals.filter(x => x !== v) : [...value.goals,v] })}>{label(lang,v)}</button>)}</div></section>
    <section className="set-card stack"><h2 className="q">{t('onb.review.format')}</h2><div className="chips">{formats.map(v => <button key={v} type="button" className={value.communityType === v ? 'chip on' : 'chip'} aria-pressed={value.communityType === v} disabled={busy} onClick={() => void save({ ...value,communityType: v })}>{label(lang,v)}</button>)}</div></section>
  </>;
}

function LanguageRegion({ privacy,location,onSaved,onError }: { privacy: Privacy; location: Location | null } & Shared) {
  const { lang,setLang,t } = useLang();
  const [city,setCity] = useState(location?.source === 'SKIPPED' ? '' : location?.city ?? ''),[busy,setBusy] = useState(false);
  const choose = async (next: Lang) => {
    if (busy || next === lang) return;
    const previous = lang;
    setLang(next);setBusy(true);
    try { await call('/settings/privacy',{ method: 'PATCH',body: { ...privacy,language: apiLocale(next) } });onSaved(t('set.saved')); }
    catch (e) { setLang(previous);onError(codeOf(e)); }
    finally { setBusy(false); }
  };
  const saveCity = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const name = city.trim();
    try {
      await call('/settings/location',{ method: 'PATCH',body: name ? { source: 'MANUAL',country: location?.country ?? 'ID',city: name,permission: 'NOT_REQUESTED' } : { source: 'SKIPPED',country: null,city: null,permission: 'NOT_REQUESTED' } });
      onSaved(t('set.saved'));
    } catch (e) { onError(codeOf(e)); } finally { setBusy(false); }
  };
  return <>
    <section className="set-card stack"><h2 className="q">{t('profile.language')}</h2><div className="chips">{(['id','en'] as const).map(option => <button key={option} type="button" className={lang === option ? 'chip on' : 'chip'} aria-pressed={lang === option} disabled={busy} onClick={() => void choose(option)}>{option === 'id' ? 'Bahasa Indonesia' : 'English'}</button>)}</div></section>
    <form className="set-card stack" onSubmit={saveCity}><label className="lbl">{t('onb.city')}<input className="in" value={city} maxLength={100} onChange={e => setCity(e.target.value)} disabled={busy}/><span className="hint">{t('set.cityNote')}</span></label><button className="btn fit" type="submit" disabled={busy}>{t('set.saveCity')}</button></form>
  </>;
}

function Blocked({ onSaved,onError }: Shared) {
  const { lang,t } = useLang();
  const [list,setList] = useState<BlockedMember[] | null>(null),[busy,setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setList(await call<BlockedMember[]>('/settings/blocks')); } catch (e) { onError(codeOf(e));setList([]); }
  },[onError]);
  useEffect(() => { void load(); },[load]);
  const unblock = async (ref: string) => {
    setBusy(true);
    try { await call(`/settings/blocks/${ref}/unblock`,{ method: 'POST',body: {} });onSaved(t('set.unblocked'));await load(); }
    catch (e) { onError(codeOf(e)); } finally { setBusy(false); }
  };
  if (!list) return <Skeleton label={t('loading.page')} variant="page"/>;
  if (!list.length) return <div className="dashed"><p className="sm">{t('set.noBlocks')}</p></div>;
  return <>
    <p className="sm">{t('set.blocksNote')}</p>
    <ul className="mini-list">{list.map((b,i) => <li key={b.ref} className="pick"><span className="stack-xs grow"><strong>{t('set.blockedName',{ n: i + 1 })}</strong><span className="sm">{new Date(b.blockedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID',{ day: 'numeric',month: 'short',year: 'numeric' })}</span></span><button type="button" className="btn2" onClick={() => void unblock(b.ref)} disabled={busy}>{t('set.unblock')}</button></li>)}</ul>
  </>;
}

function DataRights() {
  const { t } = useLang();
  const [before,after] = t('set.dataNote',{ email: '\u0000' }).split('\u0000');
  return <section className="set-card"><p className="p">{before}<a href={`mailto:${CONTACT}`}>{CONTACT}</a>{after}</p></section>;
}
