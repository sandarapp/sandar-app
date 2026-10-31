'use client';
import { useEffect, useState } from 'react';
import type { HomeData } from '../../../../packages/contracts/src/home';
import type { OnboardingState } from '../../../../packages/contracts/src/onboarding';
import type { Space } from '../../../../packages/contracts/src/spaces';
import { resumeStep } from '../../../../packages/auth-client/src/onboarding-flow';
import { useLang } from '../i18n';
import { call, memberClient } from './client';
import { HelpButton } from './help';
import { LAST, stepKeys } from './onboarding';
import { Illustration, Skeleton, Wordmark } from './ui';

const REDIRECT_SECONDS = 3;

// WA-01b: a short hand-off after logging in. Members who finished setup see a
// welcome and go to Home after a few seconds; anyone with setup left is asked
// to finish it first, with no automatic redirect.
export function Welcome({ onboarding }: { onboarding: boolean }) {
  const { t } = useLang();
  return <main className="welcome">
    <header className="welcome-top"><Wordmark/><HelpButton/></header>
    <section className="welcome-card">
      <div className="welcome-art" aria-hidden="true"><Illustration className="illu static"/></div>
      {onboarding ? <FinishSetup/> : <SignedIn/>}
    </section>
    <p className="sm welcome-foot">{t('od.safety')}</p>
  </main>;
}

function SignedIn() {
  const { t } = useLang();
  const [home,setHome] = useState<HomeData | null>(null),[spaces,setSpaces] = useState<Space[]>([]),[left,setLeft] = useState(REDIRECT_SECONDS);
  useEffect(() => { Promise.all([call<HomeData>('/home'),call<Space[]>('/spaces')]).then(([h,s]) => { setHome(h);setSpaces(s); }).catch(() => window.location.replace('/home')); },[]);
  useEffect(() => {
    if (!home) return;
    if (left <= 0) { window.location.replace('/home');return; }
    const timer = setTimeout(() => setLeft(n => n - 1),1000);
    return () => clearTimeout(timer);
  },[home,left]);
  if (!home) return <Skeleton label={t('loading.page')} variant="page"/>;
  const resume = home.continueContext && spaces.find(s => s.id === home.continueContext!.spaceId);
  return <div className="stack">
    <p className="sm">{t('wb.good')}</p>
    <p className="kk">{t('wb.signedIn')}</p>
    <h1 className="h">{t('wb.title',{ name: home.displayName })}</h1>
    <div className="redirect" role="status"><span className="sm">{t('wb.redirect',{ n: Math.max(left,0) })}</span><span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ animationDuration: `${REDIRECT_SECONDS}s` }}/></span></div>
    <div className="since">
      <p className="kk">{t('wb.since')}</p>
      <p className="p">{home.joinedSpaceIds.length ? t('wb.spaces',{ n: home.joinedSpaceIds.length }) : t('wb.noSpaces')}</p>
      {home.recentActivity.length > 0 && <p className="p">{t('wb.newPosts',{ n: home.recentActivity.length })}</p>}
    </div>
    <div className="welcome-actions">
      <a className="btn" href="/home">{t('wb.goHome')}</a>
      {resume && <a className="btn2" href={`/spaces/${resume.id}`}>{t('wb.continueIn',{ space: resume.name })}</a>}
    </div>
  </div>;
}

function FinishSetup() {
  const { t } = useLang();
  const [step,setStep] = useState<number | null>(null),[leaving,setLeaving] = useState(false);
  useEffect(() => { call<OnboardingState>('/users/me/onboarding').then(o => setStep(o.completedAt ? LAST : resumeStep(o))).catch(() => window.location.replace('/onboarding')); },[]);
  const logout = async () => {
    setLeaving(true);
    try { await memberClient().logout(); } catch { /* The server clears the cookie; go to login either way. */ }
    window.location.assign('/login');
  };
  if (step === null) return <Skeleton label={t('loading.page')} variant="page"/>;
  const n = Math.min(step,LAST - 1) + 1;
  return <div className="stack">
    <p className="sm">{t('wb.almost')}</p>
    <p className="kk">{t('wb.signedIn')}</p>
    <h1 className="h">{t('wb.finishTitle')}</h1>
    <p className="p">{t('wb.finishLead',{ n,total: LAST })}</p>
    <div className="welcome-actions">
      <a className="btn" href="/onboarding">{t('wb.finishCta',{ n,step: t(stepKeys[n - 1]!) })}</a>
      <button type="button" className="ghost" onClick={() => void logout()} disabled={leaving}>{t('wb.logout')}</button>
    </div>
  </div>;
}
