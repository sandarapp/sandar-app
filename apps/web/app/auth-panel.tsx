'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebMemberClient,Transport,type Policy } from '../../../packages/auth-client/src/client';
import { resolveDestination,type CommunityStatus } from '../../../packages/auth-client/src/destination';
import { useAuthFlow } from '../../../packages/auth-client/src/use-auth-flow';
import { parseAuthLink, type AuthScreen } from '../../../packages/auth-client/src/links';
import { authErrorText, LangSwitch, noticeText, useLang } from './i18n';
import { communityFlow } from './flags';
import { Illustration, Wordmark } from './member/ui';

const screens: AuthScreen[] = ['login','register','check-email','verify-email','forgot-password','reset-password','account'];
/** Policy pages live wherever the active policy says; fall back to the app's own copy. */
function policyUrl(policies: Policy[],type: Policy['type']) {
  const url = policies.find(p => p.type === type)?.contentUrl;
  return url && /^https?:\/\//.test(url) ? url : type === 'TERMS' ? '/legal/terms' : '/legal/privacy';
}
export function AuthPanel({ initialScreen }: {initialScreen: AuthScreen}) {
  const { lang,t } = useLang();
  const client = useMemo(() => new WebMemberClient(new Transport('/api/v1',{ web: true,online: () => navigator.onLine })),[]);
  const discardText = useRef(t('auth.discard'));discardText.current = t('auth.discard');
  const confirmDiscard = useCallback(async () => window.confirm(discardText.current),[]);
  const flow = useAuthFlow(client,initialScreen,confirmDiscard);
  const flowRef = useRef(flow);flowRef.current = flow;
  const linkHandled = useRef(false);
  const [online,setOnline] = useState(true),[showPassword,setShowPassword] = useState(false),[community,setCommunity] = useState<CommunityStatus|null>(null);
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);updateOnline();
    window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline);
    const applyLink = () => {
      const screen = window.location.pathname.slice(1);
      if (screen === 'verify-email' || screen === 'reset-password') {
        // React dev mode runs this effect twice; the token is already gone from the URL the second time.
        if (!window.location.hash && linkHandled.current) return;
        linkHandled.current = true;
        const link = parseAuthLink(window.location.href,window.location.origin);
        flowRef.current.receiveLink(screen,link?.token ?? null);
        window.history.replaceState(null,'',`/${screen}`); // Remove token/history before any API request.
      }
    };
    applyLink();
    // The website's "Register a community" button opens /register?type=community.
    if (window.location.pathname === '/register' && new URLSearchParams(window.location.search).get('type') === 'community') { if (communityFlow) flowRef.current.setAccountType('community');window.history.replaceState(null,'','/register'); }
    if (window.location.pathname === '/login') void flowRef.current.restoreSession();
    const pop = async () => {
      const path = window.location.pathname.slice(1) as AuthScreen;
      const accepted = await flowRef.current.navigate(screens.includes(path) ? path : 'login');
      if (!accepted) window.history.pushState(null,'',`/${flowRef.current.screen}`);
      else { linkHandled.current = false;applyLink(); }
    };
    const focus = () => { if (flowRef.current.screen === 'account' && !flowRef.current.busy) void flowRef.current.refreshSession(); };
    const unload = (event: BeforeUnloadEvent) => { if (flowRef.current.dirty) { event.preventDefault();event.returnValue = ''; } };
    window.addEventListener('popstate',pop);window.addEventListener('focus',focus);window.addEventListener('beforeunload',unload);
    const timer = window.setInterval(focus,60000);
    return () => { window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline);window.removeEventListener('popstate',pop);window.removeEventListener('focus',focus);window.removeEventListener('beforeunload',unload);clearInterval(timer); };
  },[]);
  useEffect(() => { if (window.location.pathname !== `/${flow.screen}`) window.history.pushState(null,'',`/${flow.screen}`); },[flow.screen]);
  // Once signed in, the server decides the next stop: onboarding, Home, or the community status.
  useEffect(() => {
    if (flow.screen !== 'account' || !flow.user) return;
    let active = true;
    resolveDestination(client).then(destination => {
      if (!active) return;
      if (destination.kind === 'member-onboarding') window.location.replace('/onboarding');
      else if (destination.kind === 'member-home') window.location.replace('/home');
      else if (destination.kind === 'community') setCommunity(destination.status);
    }).catch(() => {});
    return () => { active = false; };
  },[flow.screen,flow.user,client]);
  const go = (screen: AuthScreen) => { void flow.navigate(screen); };
  const screen = flow.screen;
  const needsEmail = ['login','register','forgot-password','check-email'].includes(screen);
  const needsPassword = ['login','register','reset-password'].includes(screen);
  const newPassword = ['register','reset-password'].includes(screen);
  const success = Boolean(flow.notice) && ['verify-email','reset-password'].includes(screen) && !flow.token;
  const step = screen === 'register' ? t('auth.step.register') : ['check-email','verify-email'].includes(screen) ? t('auth.step.verify') : screen === 'login' ? t('auth.step.login') : t('auth.step.other');
  const title = success ? screen === 'verify-email' ? t('auth.title.verified') : t('auth.title.passwordUpdated') : t(`auth.title.${screen}`);
  return <main className="auth">
    <aside className="auth-brand" aria-label={t('auth.about')}>
      <a className="wordmark-link" href="/login" aria-label="Sandar" onClick={event => { event.preventDefault();go('login'); }}><Wordmark size={34}/></a>
      <p className="auth-headline serif">{t('auth.headline')} <em>{t('auth.headlineEm')}</em>.</p>
      <p className="auth-lead">{t('auth.lead')}</p>
      <Illustration/>
    </aside>
    <section className="auth-form">
      <div className="auth-top"><span className="sm">{step}</span><LangSwitch/></div>
      <div className="auth-card">
        <h1 className="h serif">{title}</h1>
        <p className="p">{t(`auth.sub.${screen}`)}</p>
        {!online && <p className="alert a-err" role="status">{t('auth.offline')}</p>}
        {flow.error && <p className="alert a-err" role="alert" data-error-code={flow.error.code}><strong>{flow.error.status === 401 && screen === 'account' ? t('auth.sessionEnded') : ''}</strong>{authErrorText(lang,flow.error.code,flow.error.message)}{flow.cooldown > 0 && <span>{t('auth.retryInLong',{ s: flow.cooldown })}</span>}</p>}
        {flow.notice && <p className="alert a-ok" role="status">{noticeText(lang,flow.notice)}</p>}
        {flow.error?.code === 'EMAIL_VERIFICATION_REQUIRED' && <button className="link-button" onClick={() => go('check-email')}>{t('auth.resendVerify')}</button>}
        {screen === 'account' ? <>
          {flow.busy && <p className="sm" role="status">{t('auth.checking')}</p>}
          {flow.user && <div className="account-box"><strong>{flow.user.email}</strong><dl>
            <dt>{t('auth.accountType')}</dt><dd>{flow.user.accountType === 'COMMUNITY' ? t('auth.community') : t('auth.member')}</dd>
            {community && <><dt>{t('auth.application')}</dt><dd>{t(`community.${community}`)}</dd></>}
            <dt>{t('auth.emailStatus')}</dt><dd>{flow.user.emailVerifiedAt ? t('auth.verified') : t('auth.unverified')}</dd>
          </dl><p className="sm">{flow.user.accountType === 'COMMUNITY' ? t('auth.communityNote') : t('auth.opening')}</p></div>}
          {!flow.user && !flow.busy && <button className="btn wide" onClick={() => void flow.refreshSession()} disabled={flow.cooldown > 0}>{t('auth.recheck')}</button>}
          <button className="btn2 wide" onClick={() => void flow.logout()} disabled={flow.busy}>{t('common.logout')}</button>
          {flow.error?.status === 401 && <button className="link-button" onClick={() => go('login')}>{t('auth.loginAgain')}</button>}
        </> : <form className="stack" noValidate onSubmit={event => { event.preventDefault();void flow.submit(); }}>
          {screen === 'register' && communityFlow && <fieldset className="roles"><legend className="lbl">{t('auth.role.legend')}</legend>{(['member','community'] as const).map(type => <label key={type} className={flow.accountType === type ? 'role sel' : 'role'}><input type="radio" name="accountType" value={type} checked={flow.accountType === type} onChange={() => flow.setAccountType(type)} disabled={flow.busy}/><strong>{t(type === 'member' ? 'auth.role.member' : 'auth.role.community')}</strong><span className="sm">{t(type === 'member' ? 'auth.role.member.sub' : 'auth.role.community.sub')}</span></label>)}</fieldset>}
          {needsEmail && <label className="lbl">{t('auth.email')}<input className="in" name="email" type="email" autoComplete="email" value={flow.email} maxLength={254} placeholder={t('auth.emailPlaceholder')} onChange={e => flow.setEmail(e.target.value)} disabled={flow.busy} required/></label>}
          {needsPassword && !success && <label className="lbl">{newPassword ? t('auth.newPassword') : t('auth.password')}<span className="password"><input className="in" name="password" aria-label={newPassword ? t('auth.newPassword') : t('auth.password')} type={showPassword ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} value={flow.password} maxLength={128} onChange={e => flow.setPassword(e.target.value)} disabled={flow.busy} required/><button type="button" aria-label={showPassword ? t('auth.hideAria') : t('auth.showAria')} onClick={() => setShowPassword(v => !v)}>{showPassword ? t('auth.hide') : t('auth.show')}</button></span>{newPassword && <span className="hint">{t('auth.passwordHint')}</span>}</label>}
          {newPassword && !success && <label className="lbl">{t('auth.confirm')}<input className="in" name="confirmation" aria-label={t('auth.confirm')} type="password" autoComplete="new-password" value={flow.confirmation} maxLength={128} onChange={e => flow.setConfirmation(e.target.value)} disabled={flow.busy} required/>{flow.confirmation && flow.password !== flow.confirmation && <span className="fe">{t('auth.mismatch')}</span>}</label>}
          {screen === 'register' && <div className="consents">{flow.policyLoading ? <p className="sm" role="status">{t('auth.policiesLoading')}</p> : flow.policies.length !== 2 ? <button type="button" className="link-button" onClick={() => void flow.loadPolicies()}>{t('auth.policiesReload')}</button> : <>
            <label className="check"><input type="checkbox" checked={flow.terms} onChange={e => flow.setTerms(e.target.checked)} disabled={flow.busy}/><span>{t('auth.terms.pre')}<a href={policyUrl(flow.policies,'TERMS')} target="_blank" rel="noreferrer">{t('auth.terms.link')}</a>.</span></label>
            <label className="check"><input type="checkbox" checked={flow.privacy} onChange={e => flow.setPrivacy(e.target.checked)} disabled={flow.busy}/><span>{t('auth.privacy.pre')}<a href={policyUrl(flow.policies,'PRIVACY_NOTICE')} target="_blank" rel="noreferrer">{t('auth.privacy.link')}</a>.</span></label>
          </>}{flow.policies.some(p => p.version.startsWith('dev-')) && <p className="hint">{t('auth.devPolicy')}</p>}</div>}
          {screen === 'login' && <button type="button" className="link-button end" onClick={() => go('forgot-password')}>{t('auth.forgot')}</button>}
          {!success && <button className="btn wide" type="submit" disabled={!flow.canSubmit || !online}>{flow.busy ? t('common.working') : flow.cooldown > 0 ? t('auth.retryIn',{ s: flow.cooldown }) : t(`auth.submit.${screen}`)}</button>}
          {flow.token && <a className="link-button" href={`sandar://${screen}#token=${flow.token}`} rel="noreferrer">{t('auth.openApp')}</a>}
        </form>}
        {screen !== 'account' && <nav className="auth-nav sm" aria-label={t('auth.nav')}>
          {screen === 'login' ? <p>{t('auth.noAccount')} <button className="link-button" onClick={() => go('register')}>{t('auth.signUp')}</button></p> : <button className="link-button" onClick={() => go('login')}>{t('auth.backToLogin')}</button>}
          {screen === 'verify-email' && !success && <button className="link-button" onClick={() => go('check-email')}>{t('auth.newVerify')}</button>}
          {screen === 'reset-password' && !success && <button className="link-button" onClick={() => go('forgot-password')}>{t('auth.newReset')}</button>}
          {screen === 'register' && <p>{t('auth.emailPrivate')}</p>}
        </nav>}
        <p className="safety sm">{t('auth.safety')}</p>
      </div>
      <footer className="auth-foot sm"><span>© Sandar</span><a href={policyUrl(flow.policies,'PRIVACY_NOTICE')}>{t('auth.privacyLink')}</a></footer>
    </section>
  </main>;
}
