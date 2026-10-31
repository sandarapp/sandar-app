'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { participationPreferences, supportInterests, type OnboardingState } from '../../../../packages/contracts/src/onboarding';
import { resumeStep, selectInterest } from '../../../../packages/auth-client/src/onboarding-flow';
import { apiLocale, LangSwitch, useLang } from '../i18n';
import { call, codeOf, memberClient } from './client';
import { errorKey, label, ruleKeys } from './copy';
import { HelpButton } from './help';
import { Skeleton, Wordmark } from './ui';

type Location = NonNullable<OnboardingState['location']>;
type Need = NonNullable<OnboardingState['preferences']>['needs'][number];
type Goal = NonNullable<OnboardingState['preferences']>['goals'][number];
type Format = NonNullable<OnboardingState['preferences']>['communityType'];
type Privacy = NonNullable<OnboardingState['privacy']>;

const LAST = 10;
const REQUIRED = new Set([1,2,3,8]);
const stepKeys = ['onb.s0','onb.s1','onb.s2','onb.s3','onb.s4','onb.s5','onb.s6','onb.s7','onb.s8','onb.s9'] as const;
const whyKeys = ['onb.w0','onb.w1','onb.w2','onb.w3','onb.w4','onb.w5','onb.w6','onb.w7','onb.w8','onb.w9'] as const;
const formats: Format[] = ['ONLINE','LOCAL','MIXED','NO_PREFERENCE'];
const emptyPrivacy: Privacy = { displayName: '',language: 'id-ID',profileVisibility: 'HIDDEN',directoryVisibility: 'HIDDEN',allowAnonymousPosting: true };

export function Onboarding() {
  const { lang,t } = useLang();
  const [server,setServer] = useState<OnboardingState | null>(null);
  const [step,setStep] = useState(0),[reached,setReached] = useState(0),[busy,setBusy] = useState(false),[error,setError] = useState('');
  const [adult,setAdult] = useState<boolean | null>(null),[accepted,setAccepted] = useState(false);
  const [location,setLocation] = useState<Location>({ source: 'SKIPPED',country: null,city: null,permission: 'NOT_REQUESTED' });
  const [needs,setNeeds] = useState<Need[]>([]),[goals,setGoals] = useState<Goal[]>([]),[format,setFormat] = useState<Format>('NO_PREFERENCE');
  const [privacy,setPrivacy] = useState<Privacy>(emptyPrivacy),[editing,setEditing] = useState(false),[leaving,setLeaving] = useState(false);
  const pending = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await call<OnboardingState>('/users/me/onboarding');
      setServer(data);setAdult(data.ageConfirmed ? true : null);
      setAccepted(Boolean(data.policy && data.boundariesVersion === data.policy.version && data.boundariesLocale === data.policy.locale));
      if (data.location) setLocation({ source: data.location.source,country: data.location.country,city: data.location.city,permission: data.location.permission });
      setNeeds((data.preferences?.needs ?? []) as Need[]);setGoals((data.preferences?.goals ?? []) as Goal[]);setFormat(data.preferences?.communityType ?? 'NO_PREFERENCE');
      if (data.privacy) setPrivacy(data.privacy);
      const resume = data.completedAt ? LAST : resumeStep(data);
      setStep(resume);setReached(resume);
    } catch (e) { setError(codeOf(e)); }
  },[]);
  useEffect(() => { void load(); },[load]);
  useEffect(() => { window.scrollTo({ top: 0 }); },[step]);

  async function save(path: string,body: unknown,next: number,method: 'PATCH' | 'POST' = 'PATCH') {
    if (pending.current) return;
    pending.current = true;setBusy(true);setError('');
    try {
      setServer(await call<OnboardingState>(path,{ method,body }));
      const target = editing ? 9 : next;
      setStep(target);setReached(r => Math.max(r,target));setEditing(false);
    } catch (e) { setError(codeOf(e)); }
    finally { pending.current = false;setBusy(false); }
  }
  const edit = (target: number) => { setEditing(true);setStep(target);setError(''); };
  const back = () => { setError('');if (editing) { setEditing(false);setStep(9); } else setStep(n => Math.max(0,n - 1)); };
  // Answers are already saved on the server, so leaving only ends the session.
  const saveAndExit = async () => {
    setLeaving(true);
    try { await memberClient().logout(); } catch { /* The server clears the cookie; go to login either way. */ }
    window.location.assign('/login');
  };

  const bar = <header className="bar">
    <Wordmark/><span className="grow"/>
    <LangSwitch/><HelpButton/>
    {step < LAST && <button type="button" className="ghost" onClick={() => void saveAndExit()} disabled={leaving || busy}>{t('onb.saveExit')}</button>}
  </header>;

  if (!server) return <div className="onb">{bar}<main className="onb-main">{error
    ? <div className="empty"><h1 className="h serif">{t('onb.loadFail')}</h1><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => { setError('');void load(); }}>{t('common.tryAgain')}</button></div>
    : <Skeleton label={t('loading.page')} variant="page"/>}</main></div>;

  const policy = server.policy;
  const choice = (value: string) => label(lang,value);
  const steps: Record<number,() => React.ReactNode> = {
    0: () => <Frame title={t('onb.welcome')} lead={t('onb.welcome.p')}>
      <ul className="ticks"><li>{t('onb.welcome.l1')}</li><li>{t('onb.welcome.l2')}</li><li>{t('onb.welcome.l3')}</li></ul>
      <Next onClick={() => void save('/users/me/onboarding/progress',{ step: 1 },1)} busy={busy}>{t('onb.start')}</Next>
    </Frame>,
    1: () => <Frame title={t('onb.age')} lead={t('onb.age.p')}>
      <div className="choices" role="radiogroup" aria-label={t('onb.age.aria')}>
        <Choice on={adult === true} onClick={() => setAdult(true)} radio>{t('onb.age.yes')}</Choice>
        <Choice on={adult === false} onClick={() => setAdult(false)} radio>{t('onb.age.no')}</Choice>
      </div>
      {adult === false && <p className="alert a-err" role="alert">{t('onb.age.block')}</p>}
      <Next onClick={() => void save('/users/me/onboarding/age',{ confirmed: true },2)} busy={busy} disabled={adult !== true}>{t('onb.continue')}</Next>
    </Frame>,
    2: () => <Frame title={t('onb.about')} lead={t('onb.about.p')}>
      <dl className="pairs">
        <div><dt>{t('onb.about.is')}</dt><dd>{t('onb.about.is.d')}</dd></div>
        <div><dt>{t('onb.about.not')}</dt><dd>{t('onb.about.not.d')}</dd></div>
      </dl>
      <p className="alert a-warn"><strong>{t('onb.about.emergency')}</strong> {t('help.emergency')} · {t('help.crisis')} · {t('help.health')}.</p>
      <Next onClick={() => void save('/users/me/onboarding/progress',{ step: 3 },3)} busy={busy}>{t('onb.about.ok')}</Next>
    </Frame>,
    3: () => <Frame title={t('onb.rules')} lead={t('onb.rules.p')}>
      <ol className="rules">{ruleKeys.map(key => <li key={key}>{t(key)}</li>)}</ol>
      {policy ? <label className="check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span>{t('onb.rules.agree')}</span></label>
        : <p className="alert a-warn">{t('onb.rules.missing')} <button className="link-button" onClick={() => void load()}>{t('common.reload')}</button></p>}
      <Next onClick={() => policy && void save('/users/me/onboarding/boundaries',{ accepted: true,locale: policy.locale,policyVersion: policy.version },4)} busy={busy} disabled={!policy || !accepted}>{t('onb.rules.ok')}</Next>
    </Frame>,
    4: () => <LocationStep value={location} onChange={setLocation} busy={busy} onSave={body => void save('/users/me/location',body,5)}/>,
    5: () => <Frame title={t('onb.topics')} lead={t('onb.topics.p')}>
      <div className="chips">{supportInterests.map(v => <Choice key={v} on={needs.includes(v)} onClick={() => setNeeds(n => selectInterest(n,v as Need))}>{choice(v)}</Choice>)}</div>
      <Next onClick={() => void save('/users/me/interests',{ needs },6)} busy={busy} skip={!needs.length}>{needs.length ? t('onb.continueN',{ n: needs.length }) : t('onb.skip')}</Next>
    </Frame>,
    6: () => <Frame title={t('onb.part')} lead={t('onb.part.p')}>
      <div className="chips">{participationPreferences.map(v => <Choice key={v} on={goals.includes(v)} onClick={() => setGoals(g => g.includes(v) ? g.filter(x => x !== v) : [...g,v])}>{choice(v)}</Choice>)}</div>
      <Next onClick={() => void save('/users/me/participation',{ goals },7)} busy={busy} skip={!goals.length}>{goals.length ? t('onb.continue') : t('onb.skip')}</Next>
    </Frame>,
    7: () => <Frame title={t('onb.format')} lead={t('onb.format.p')}>
      <div className="choices" role="radiogroup" aria-label={t('onb.format.aria')}>{formats.map(v => <Choice key={v} on={format === v} onClick={() => setFormat(v)} radio>{choice(v)}</Choice>)}</div>
      <Next onClick={() => void save('/users/me/community-format',{ communityType: format },8)} busy={busy}>{t('onb.continue')}</Next>
    </Frame>,
    8: () => <Frame title={t('onb.privacy')} lead={t('onb.privacy.p')}>
      <label className="lbl">{t('onb.privacy.name')}<input className="in" value={privacy.displayName} maxLength={80} autoComplete="nickname" onChange={e => setPrivacy(p => ({ ...p,displayName: e.target.value }))}/></label>
      <Toggle on={privacy.profileVisibility === 'MEMBERS'} onChange={on => setPrivacy(p => ({ ...p,profileVisibility: on ? 'MEMBERS' : 'HIDDEN' }))}>{t('onb.privacy.profile')}</Toggle>
      <Toggle on={privacy.directoryVisibility === 'DISPLAY_NAME'} onChange={on => setPrivacy(p => ({ ...p,directoryVisibility: on ? 'DISPLAY_NAME' : 'HIDDEN' }))}>{t('onb.privacy.directory')}</Toggle>
      <Toggle on={privacy.allowAnonymousPosting} onChange={on => setPrivacy(p => ({ ...p,allowAnonymousPosting: on }))}>{t('onb.privacy.anon')}</Toggle>
      <Next onClick={() => void save('/users/me/privacy',{ ...privacy,language: apiLocale(lang),displayName: privacy.displayName.trim() },9)} busy={busy} disabled={!privacy.displayName.trim()}>{t('onb.continue')}</Next>
    </Frame>,
    9: () => <Frame title={t('onb.review')} lead={t('onb.review.p')}>
      <dl className="review">
        <Row label={t('onb.review.location')} value={server.location?.source === 'SKIPPED' || !server.location ? t('onb.review.skipped') : `${server.location.city}, ${server.location.countryName ?? server.location.country}`} onEdit={() => edit(4)}/>
        <Row label={t('onb.review.topics')} value={needs.map(choice).join(', ') || t('onb.review.none')} onEdit={() => edit(5)}/>
        <Row label={t('onb.review.part')} value={goals.map(choice).join(', ') || t('onb.review.none')} onEdit={() => edit(6)}/>
        <Row label={t('onb.review.format')} value={choice(format)} onEdit={() => edit(7)}/>
        <Row label={t('onb.review.privacy')} value={`${privacy.displayName} · ${privacy.profileVisibility === 'MEMBERS' ? t('onb.review.visible') : t('onb.review.hidden')}`} onEdit={() => edit(8)}/>
      </dl>
      <Next onClick={() => void save('/users/me/onboarding/complete',{},LAST,'POST')} busy={busy}>{t('onb.finish')}</Next>
    </Frame>,
    10: () => <Frame title={t('onb.done')} lead={t('onb.done.p')}>
      <p className="alert a-info">{t('onb.done.note')}</p>
      <a className="btn fit" href="/home">{t('common.toHome')}</a>
    </Frame>
  };

  return <div className="onb">
    {bar}
    <div className="onb-body">
      {step < LAST && <nav className="steps" aria-label={t('onb.steps')}><ol>
        {stepKeys.map((key,n) => {
          const state = n === step ? 'cur' : n < reached ? 'done' : '';
          const body = <><span className="n" aria-hidden="true">{n < reached && n !== step ? '✓' : n + 1}</span>{t(key)}</>;
          // Completed steps can be revisited; later ones open only in order.
          return <li key={key} className={`st ${state}`} aria-current={n === step ? 'step' : undefined}>
            {n < reached && n !== step && !busy ? <button type="button" onClick={() => { setEditing(false);setError('');setStep(n); }}>{body}</button> : <span>{body}</span>}
          </li>;
        })}
      </ol></nav>}
      <main className="onb-main">
        {step < LAST && <div className="onb-meta">
          {step > 0 && <button className="link-button" onClick={back} disabled={busy}>{t('onb.back')}</button>}
          <span className="sm">{t('onb.stepOf',{ n: step + 1,total: LAST })} · {REQUIRED.has(step) ? t('onb.required') : t('onb.optional')}</span>
          <div className="track" role="progressbar" aria-valuemin={1} aria-valuemax={LAST} aria-valuenow={step + 1}><div style={{ width: `${(step + 1) / LAST * 100}%` }}/></div>
        </div>}
        {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
        {steps[step]!()}
        {step < LAST && <p className="sm onb-foot">{t('onb.autosave')}</p>}
      </main>
      {step < LAST && <aside className="why"><h2 className="q">{t('onb.why')}</h2><p className="sm">{t(whyKeys[step]!)}</p></aside>}
    </div>
  </div>;
}

function Frame({ title,lead,children }: { title: string; lead: string; children: React.ReactNode }) {
  return <section className="frame"><h1 className="h serif">{title}</h1><p className="p">{lead}</p>{children}</section>;
}
function Next({ onClick,busy,disabled,skip,children }: { onClick: () => void; busy: boolean; disabled?: boolean; skip?: boolean; children: React.ReactNode }) {
  const { t } = useLang();
  return <button className={skip ? 'btn2 next' : 'btn next'} onClick={onClick} disabled={busy || disabled}>{busy ? t('common.saving') : children}</button>;
}
function Choice({ on,onClick,radio,children }: { on: boolean; onClick: () => void; radio?: boolean; children: React.ReactNode }) {
  return <button type="button" className={on ? 'chip on' : 'chip'} onClick={onClick} role={radio ? 'radio' : undefined} aria-checked={radio ? on : undefined} aria-pressed={radio ? undefined : on}>{children}</button>;
}
function Toggle({ on,onChange,children }: { on: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return <label className="toggle"><span>{children}</span><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)}/></label>;
}
function Row({ label: name,value,onEdit }: { label: string; value: string; onEdit: () => void }) {
  const { t } = useLang();
  return <div><dt>{name}</dt><dd>{value}</dd><button className="link-button" onClick={onEdit} aria-label={t('onb.review.editAria',{ label: name })}>{t('common.edit')}</button></div>;
}

function LocationStep({ value,onChange,busy,onSave }: { value: Location; onChange: (v: Location) => void; busy: boolean; onSave: (body: Location) => void }) {
  const { t } = useLang();
  const [countries,setCountries] = useState<{ code: string; name: string }[]>([]);
  const [query,setQuery] = useState(''),[cities,setCities] = useState<string[]>([]),[manual,setManual] = useState(value.source === 'MANUAL'),[failed,setFailed] = useState(false);
  const country = value.country ?? 'ID';
  useEffect(() => { call<{ code: string; name: string }[]>('/locations/countries').then(setCountries).catch(() => setFailed(true)); },[]);
  useEffect(() => {
    if (manual) return;
    let active = true;
    const timer = setTimeout(() => {
      call<string[]>(`/locations/cities?country=${encodeURIComponent(country)}&q=${encodeURIComponent(query)}`)
        .then(list => { if (active) setCities(list); }).catch(() => { if (active) setFailed(true); });
    },200);
    return () => { active = false;clearTimeout(timer); };
  },[country,query,manual]);
  const city = value.source === 'SKIPPED' ? null : value.city;
  return <Frame title={t('onb.location')} lead={t('onb.location.p')}>
    <label className="lbl">{t('onb.country')}<select className="in" value={country} onChange={e => { onChange({ source: 'SKIPPED',country: e.target.value,city: null,permission: 'NOT_REQUESTED' });setQuery(''); }}>
      {countries.length ? countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>) : <option value="ID">Indonesia</option>}
    </select></label>
    {manual ? <label className="lbl">{t('onb.city')}<input className="in" value={city ?? ''} maxLength={100} onChange={e => onChange({ source: 'MANUAL',country,city: e.target.value,permission: 'NOT_REQUESTED' })}/></label> : <>
      <label className="lbl">{t('onb.citySearch')}<input className="in" value={query} maxLength={100} placeholder={t('onb.cityPlaceholder')} onChange={e => setQuery(e.target.value)}/></label>
      <div className="chips">{cities.map(c => <Choice key={c} on={city === c} onClick={() => onChange({ source: 'DIRECTORY',country,city: c,permission: 'NOT_REQUESTED' })} radio>{c}</Choice>)}</div>
      {(failed || (query && !cities.length)) && <p className="sm">{t('onb.cityMissing')}</p>}
    </>}
    <button className="link-button" onClick={() => { setManual(m => !m);onChange({ source: 'SKIPPED',country,city: null,permission: 'NOT_REQUESTED' }); }}>{manual ? t('onb.cityList') : t('onb.cityManual')}</button>
    <Next onClick={() => onSave(city?.trim() ? { ...value,country,city: city.trim() } : { source: 'SKIPPED',country: null,city: null,permission: 'NOT_REQUESTED' })} busy={busy} skip={!city?.trim()}>{city?.trim() ? t('onb.continue') : t('onb.skip')}</Next>
  </Frame>;
}
