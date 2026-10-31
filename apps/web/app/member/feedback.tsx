'use client';
import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey } from './copy';
import { SafetyModal } from './ui';

const ASKED = 'sandar.helpfulAskedAt';
const GAP = 14 * 24 * 60 * 60 * 1000;
const kinds = ['IDEA','BROKEN','OTHER'] as const;
const stored = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const store = (key: string,value: string) => { try { window.localStorage.setItem(key,value); } catch { /* A convenience only. */ } };
// Only a page name, never ids or search text.
const pageName = () => window.location.pathname.replace(/\/[0-9a-f-]{36}$/i,'').toLowerCase().slice(0,80);

// WA-08b, WA-08c. Keeps the text if sending fails, and points urgent things elsewhere.
export function Feedback({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [kind,setKind] = useState<typeof kinds[number]>('IDEA'),[body,setBody] = useState(''),[contact,setContact] = useState(false),[withPage,setWithPage] = useState(true),[busy,setBusy] = useState(false),[error,setError] = useState(''),[sent,setSent] = useState(false),[safety,setSafety] = useState(false);
  const [page,setPage] = useState('');
  useEffect(() => { setPage(pageName()); },[]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !safety) onClose(); };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[onClose,safety]);
  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy(true);setError('');
    try { await call('/feedback',{ method: 'POST',body: { kind,body: body.trim(),contactOk: contact,...(withPage && page ? { page } : {}) } });setSent(true); }
    catch (e) { const code = codeOf(e);if (code === 'SELF_HARM_SUPPORT') setSafety(true);else setError(code); }
    finally { setBusy(false); }
  };
  return <div className="scrim compose-scrim">
    <div className="modal create-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      {sent ? <div className="stack" role="status"><h2 id="feedback-title" className="serif">{t('fb.sent.t')}</h2><p className="p">{t('fb.sent.p')}</p><button type="button" className="btn fit" onClick={onClose}>{t('common.close')}</button></div> : <>
        <div className="row-between"><h2 id="feedback-title" className="serif">{t('fb.title')}</h2><button type="button" className="ghost" onClick={onClose}>{t('common.cancel')}</button></div>
        {page && withPage && <button type="button" className="chip fit" onClick={() => setWithPage(false)} aria-label={t('fb.removePage')}>{t('fb.about',{ page })} ×</button>}
        <div className="chips" role="group" aria-label={t('fb.kind')}>{kinds.map(k => <button key={k} type="button" className={kind === k ? 'chip on' : 'chip'} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`fb.kind.${k}`)}</button>)}</div>
        <label className="lbl">{t('fb.more')}<textarea className="ta" rows={4} maxLength={1000} value={body} onChange={e => setBody(e.target.value)}/><span className="sm">{body.length} / 1000</span></label>
        <p className="alert a-warn">{t('fb.warn')}</p>
        <label className="check"><input type="checkbox" checked={contact} onChange={e => setContact(e.target.checked)}/><span>{t('fb.contact')}</span></label>
        {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
        <div className="modal-actions"><span className="sm">{t('fb.noPosts')}</span><button type="button" className="btn" disabled={busy || !body.trim()} onClick={() => void send()}>{busy ? t('common.working') : t('fb.send')}</button></div>
      </>}
    </div>
    {safety && <SafetyModal onClose={() => setSafety(false)}/>}
  </div>;
}

// A one-line question inside the page, at most once every 14 days per person.
export function HelpfulPrompt({ moment }: { moment: string }) {
  const { t } = useLang();
  const [show,setShow] = useState(false),[step,setStep] = useState<'ask' | 'more' | 'thanks'>('ask'),[body,setBody] = useState('');
  useEffect(() => {
    const dismissed = stored(`sandar.helpfulOff.${moment}`) === '1',asked = Number(stored(ASKED) ?? 0);
    if (dismissed || Date.now() - asked < GAP) return;
    store(ASKED,String(Date.now()));setShow(true);
  },[moment]);
  if (!show) return null;
  const answer = (kind: 'HELPFUL' | 'NOT_HELPFUL',text?: string) => call('/feedback',{ method: 'POST',body: { kind,moment,...(text ? { body: text } : {}) } }).catch(() => {});
  return <aside className="helpful">
    {step === 'ask' && <><span className="q grow">{t('help.q')}</span><button type="button" className="chip" onClick={() => { void answer('HELPFUL');setStep('thanks'); }}>{t('help.yes')}</button><button type="button" className="chip" onClick={() => setStep('more')}>{t('help.no')}</button><button type="button" className="ghost" aria-label={t('common.close')} onClick={() => { store(`sandar.helpfulOff.${moment}`,'1');setShow(false); }}>×</button></>}
    {step === 'more' && <form className="stack-sm grow" onSubmit={event => { event.preventDefault();void answer('NOT_HELPFUL',body.trim());setStep('thanks'); }}><label className="lbl">{t('help.missing')}<input className="in" maxLength={300} value={body} onChange={e => setBody(e.target.value)}/></label><div className="chips"><button type="submit" className="btn small">{t('fb.send')}</button></div></form>}
    {step === 'thanks' && <span className="sm" role="status">{t('help.thanks')}</span>}
  </aside>;
}
