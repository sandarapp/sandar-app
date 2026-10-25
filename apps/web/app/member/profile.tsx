'use client';
import { useEffect, useState } from 'react';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import { LangSwitch, useLang } from '../i18n';
import { call, codeOf, memberClient } from './client';
import { errorKey, label } from './copy';

const CONTACT = 'hellosandar@zohomail.com';

// Read-only for launch: privacy settings are fixed once onboarding is done, so
// changes and data requests go to Sandar by email until in-app settings ship.
export function Profile() {
  const { lang,t } = useLang();
  const [email,setEmail] = useState(''),[state,setState] = useState<OnboardingState | null>(null),[error,setError] = useState(''),[leaving,setLeaving] = useState(false);
  const load = async () => {
    setError('');
    try {
      const [me,o] = await Promise.all([call<{ email: string }>('/users/me'),call<OnboardingState>('/users/me/onboarding')]);
      setEmail(me.email);setState(o);
    } catch (e) { setError(codeOf(e)); }
  };
  useEffect(() => { void load(); },[]);
  const logout = async () => {
    setLeaving(true);
    try { await memberClient().logout(); } catch { /* The server clears the cookie; go to login either way. */ }
    window.location.assign('/login');
  };
  if (error) return <div className="empty"><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div>;
  if (!state) return <p className="loading" role="status">{t('common.loading')}</p>;
  const privacy = state.privacy;
  const needs = state.preferences?.needs ?? [];
  const [before,after] = t('profile.data',{ email: '\u0000' }).split('\u0000');
  return <div className="stack-lg narrow">
    <header className="stack-sm"><h1 className="display serif">{t('profile.title')}</h1><p className="p">{t('profile.lead')}</p></header>
    <dl className="review">
      <div><dt>{t('auth.emailStatus')}</dt><dd>{email}</dd></div>
      <div><dt>{t('profile.displayName')}</dt><dd>{privacy?.displayName ?? '—'}</dd></div>
      <div><dt>{t('profile.visibility')}</dt><dd>{privacy?.profileVisibility === 'MEMBERS' ? t('profile.members') : t('profile.hidden')}</dd></div>
      <div><dt>{t('profile.directory')}</dt><dd>{privacy?.directoryVisibility === 'DISPLAY_NAME' ? t('profile.directory.shown') : t('profile.directory.hidden')}</dd></div>
      <div><dt>{t('profile.topics')}</dt><dd>{needs.map(n => label(lang,n)).join(', ') || t('profile.none')}</dd></div>
      <div><dt>{t('profile.language')}</dt><dd><LangSwitch/></dd></div>
    </dl>
    <p className="alert a-info">{before}<a href={`mailto:${CONTACT}`}>{CONTACT}</a>{after}</p>
    <button className="btn2 fit" onClick={() => void logout()} disabled={leaving}>{t('common.logout')}</button>
  </div>;
}
