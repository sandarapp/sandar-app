'use client';
import { useEffect, useRef, useState } from 'react';
import { discoveryTopics } from '../../../../packages/contracts/src/discovery';
import type { Space } from '../../../../packages/contracts/src/spaces';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, label } from './copy';
import { SafetyModal } from './ui';

const DRAFT = 'sandar.spaceDraft';
const MAX_RULES = 8;
type Draft = { name: string; purpose: string; topics: string[]; anonymous: boolean; rules: string[] };

function readDraft(): Partial<Draft> {
  try { return JSON.parse(window.localStorage.getItem(DRAFT) ?? '{}') as Partial<Draft>; } catch { return {}; }
}
function saveDraft(draft: Draft | null) {
  try { if (draft) window.localStorage.setItem(DRAFT,JSON.stringify(draft));else window.localStorage.removeItem(DRAFT); } catch { /* A draft is a convenience; the form still works. */ }
}

// WA-03c: two steps in a modal. A new space goes to Sandar for review before anyone else sees it.
export function CreateSpace({ initialName,edit,onClose }: { initialName?: string; edit?: Space; onClose: () => void }) {
  const { lang,t } = useLang();
  const [draft] = useState<Partial<Draft>>(() => edit ? {} : readDraft());
  const [step,setStep] = useState(1),[busy,setBusy] = useState(false),[error,setError] = useState(''),[safety,setSafety] = useState(false),[pledge,setPledge] = useState(false);
  const [name,setName] = useState(edit?.name ?? initialName ?? draft.name ?? ''),[purpose,setPurpose] = useState(edit?.purpose ?? draft.purpose ?? '');
  const [topics,setTopics] = useState<string[]>(edit?.topics ?? draft.topics ?? []),[anonymous,setAnonymous] = useState(edit?.anonymousAllowed ?? draft.anonymous ?? true);
  const [rules,setRules] = useState<string[]>(edit?.rules ?? draft.rules ?? [t('cs.rule1'),t('cs.rule2'),t('cs.rule3')]);
  const requestId = useRef(crypto.randomUUID());

  // A changed form is a new request; a retry of the same form sends it only once.
  useEffect(() => {
    requestId.current = crypto.randomUUID();
    if (!edit) saveDraft({ name,purpose,topics,anonymous,rules });
  },[edit,name,purpose,topics,anonymous,rules]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !safety) onClose(); };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[onClose,safety]);

  const toggle = (topic: string) => setTopics(list => list.includes(topic) ? list.filter(x => x !== topic) : list.length < 2 ? [...list,topic] : list);
  const firstReady = name.trim().length >= 3 && purpose.trim().length >= 10 && topics.length > 0;
  const cleanRules = rules.map(rule => rule.trim()).filter(Boolean);
  const send = async () => {
    if (busy) return;
    setBusy(true);setError('');
    const body = { requestId: requestId.current,name: name.trim(),purpose: purpose.trim(),topics,anonymousAllowed: anonymous,rules: cleanRules,pledge: true };
    try {
      const sent = await call<{ id: string }>(edit ? `/member-spaces/${edit.id}` : '/member-spaces',{ method: edit ? 'PATCH' : 'POST',body });
      if (!edit) saveDraft(null);
      window.location.assign(`/spaces/${sent.id}`);
    } catch (e) {
      const code = codeOf(e);
      if (code === 'SELF_HARM_SUPPORT') setSafety(true);else setError(code);
      setBusy(false);
    }
  };

  return <div className="scrim compose-scrim">
    <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <div className="row-between">
        {step === 1 ? <button type="button" className="ghost" onClick={onClose}>{t('common.cancel')}</button> : <button type="button" className="ghost" onClick={() => setStep(1)}>{t('common.back')}</button>}
        <span className="sm">{t('cs.step',{ n: step })}</span>
      </div>
      <h2 id="create-title" className="serif">{step === 1 ? t('cs.title') : t('cs.title2')}</h2>
      {step === 1 ? <>
        <label className="lbl">{t('cs.name')}<input className="in" value={name} maxLength={40} onChange={e => setName(e.target.value)}/><span className="sm">{name.length} / 40</span></label>
        <label className="lbl">{t('cs.purpose')}<textarea className="ta" rows={3} value={purpose} maxLength={200} onChange={e => setPurpose(e.target.value)}/><span className="sm">{purpose.length} / 200</span></label>
        <fieldset className="stack-sm plain"><legend className="lbl">{t('cs.topics')}</legend>
          <div className="chips">{discoveryTopics.map(topic => <button key={topic} type="button" className={topics.includes(topic) ? 'chip on' : 'chip'} aria-pressed={topics.includes(topic)} onClick={() => toggle(topic)}>{label(lang,topic)}</button>)}</div>
        </fieldset>
        <label className="check"><input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)}/><span>{t('cs.anonymous')}</span></label>
        <p className="sm">{t('cs.open')}</p>
        <div className="modal-actions"><span className="sm">{edit ? '' : t('cs.saved')}</span><button type="button" className="btn" disabled={!firstReady} onClick={() => setStep(2)}>{t('cs.next')}</button></div>
      </> : <>
        <div className="stack-sm">
          <p className="lbl">{t('cs.rules')}</p><p className="sm">{t('cs.rules.p')}</p>
          {rules.map((rule,i) => <div key={i} className="rule-row">
            <input className="in" aria-label={t('cs.ruleN',{ n: i + 1 })} value={rule} maxLength={140} onChange={e => setRules(list => list.map((x,n) => n === i ? e.target.value : x))}/>
            <button type="button" className="ghost" aria-label={t('cs.ruleRemove',{ n: i + 1 })} disabled={rules.length === 1} onClick={() => setRules(list => list.filter((_,n) => n !== i))}>×</button>
          </div>)}
          {rules.length < MAX_RULES && <button type="button" className="link-button fit" onClick={() => setRules(list => [...list,''])}>{t('cs.ruleAdd')}</button>}
        </div>
        <section className="set-card stack-xs" aria-label={t('cs.preview')}>
          <p className="kk">{t('cs.preview')}</p>
          <span className="mini fit">{t('disc.member')}</span>
          <strong className="serif">{name.trim()}</strong>
          <p className="sm">{purpose.trim()}</p>
          <p className="sm">{anonymous ? t('cs.preview.anon') : t('cs.preview.named')}</p>
        </section>
        <label className="check"><input type="checkbox" checked={pledge} onChange={e => setPledge(e.target.checked)}/><span>{t('cs.pledge')}</span></label>
        {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
        <div className="modal-actions"><span className="sm">{t('cs.reviewTime')}</span><button type="button" className="btn" disabled={busy || !pledge || !cleanRules.length} onClick={() => void send()}>{busy ? t('common.working') : t('cs.send')}</button></div>
      </>}
    </div>
    {safety && <SafetyModal onClose={() => setSafety(false)}/>}
  </div>;
}

// What a host sees on their own space while it isn't open yet.
export function SpaceStatus({ space }: { space: Space }) {
  const { t } = useLang();
  const [editing,setEditing] = useState(false);
  return <section className="panel stack" role="status">
    {space.status === 'IN_REVIEW' && <><h2 className="h3 serif">{t('cs.review.t',{ name: space.name })}</h2><p className="p">{t('cs.review.p')}</p></>}
    {space.status === 'NEEDS_CHANGES' && <><h2 className="h3 serif">{t('cs.changes.t')}</h2><p className="alert a-warn">{space.reviewNote}</p><button type="button" className="btn fit" onClick={() => setEditing(true)}>{t('cs.changes.edit')}</button></>}
    {space.status === 'NOT_APPROVED' && <><h2 className="h3 serif">{t('cs.rejected.t')}</h2><p className="alert a-warn">{space.reviewNote}</p><p className="sm">{t('cs.rejected.p')} <a href="mailto:hellosandar@zohomail.com">hellosandar@zohomail.com</a></p></>}
    {editing && <CreateSpace edit={space} onClose={() => setEditing(false)}/>}
  </section>;
}
