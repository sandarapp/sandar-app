'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { moods, moodWords, type Mood, type MoodState } from '../../../../packages/contracts/src/member';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey } from './copy';
import { HelpButton } from './help';

const LOW_CARD_OFF = 'sandar.lowCardOff';
const look: Record<Mood,{ fill: string; mouth: string }> = {
  GREAT: { fill: '#FFD15C',mouth: 'M21 38q11 11 22 0' },
  OKAY: { fill: '#FFC59E',mouth: 'M23 39q9 6 18 0' },
  MEH: { fill: '#C9F0E5',mouth: 'M24 41h16' },
  LOW: { fill: '#CFE3FF',mouth: 'M23 44q9-6 18 0' },
  REALLY_HARD: { fill: '#E0D6F7',mouth: 'M22 45q10-9 20 0' }
};

export function Face({ mood,size = 56 }: { mood: Mood; size?: number }) {
  const { fill,mouth } = look[mood];
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5c15 0 27 10 27 26S48 59 32 59 5 47 5 31 17 5 32 5z" fill={fill}/><circle cx="23" cy="29" r="3.2" fill="#2B2A33"/><circle cx="41" cy="29" r="3.2" fill="#2B2A33"/><circle cx="16" cy="37" r="4" fill="#FF9E8A" opacity=".45"/><circle cx="48" cy="37" r="4" fill="#FF9E8A" opacity=".45"/><path d={mouth} fill="none" stroke="#2B2A33" strokeWidth="3" strokeLinecap="round"/></svg>;
}

// WA-10b A: one tap saves it, words are an optional second step. No streaks, no
// scores, and a harder day asks for less. Choosing a mood alerts nobody.
export function MoodCheck() {
  const { t } = useLang();
  const [state,setState] = useState<MoodState | null>(null),[words,setWords] = useState<string[]>([]),[step,setStep] = useState<'ask' | 'words' | 'reply'>('ask'),[error,setError] = useState(''),[changing,setChanging] = useState(false),[skipped,setSkipped] = useState(false);
  const [lowOff,setLowOff] = useState(() => { try { return window.localStorage.getItem(LOW_CARD_OFF) === '1'; } catch { return false; } });
  useEffect(() => { call<MoodState>('/mood').then(setState).catch(() => setState(null)); },[]);
  const save = useCallback(async (mood: Mood,chosen: string[]) => {
    setError('');
    try { setState(await call<MoodState>('/mood',{ method: 'POST',body: { mood,words: chosen } })); }
    catch (e) { setError(codeOf(e)); }
  },[]);
  if (!state?.enabled || skipped) return null;
  const mood = state.today?.mood ?? null;
  const offLow = () => { setLowOff(true);try { window.localStorage.setItem(LOW_CARD_OFF,'1'); } catch { /* Only lasts this visit then. */ } };
  const lowCard = state.lowDays > 0 && !lowOff && <aside className="alert a-info stack-sm"><strong>{t('mood.lowRun.t')}</strong><span>{t('mood.lowRun.p')}</span><span className="row-between"><Link className="sm-link" href="/discover">{t('mood.lowRun.people')}</Link><button type="button" className="ghost" onClick={offLow}>{t('mood.lowRun.off')}</button></span></aside>;

  if (mood && step === 'ask' && !changing) return <>{lowCard}<section className="mood-line" aria-label={t('mood.title')}><Face mood={mood} size={32}/><span className="sm grow">{t('mood.today',{ mood: t(`mood.${mood}`) })}</span><button type="button" className="ghost" onClick={() => setChanging(true)}>{t('mood.change')}</button></section></>;

  return <section className="mood-card stack" aria-label={t('mood.title')}>
    {step === 'ask' || changing ? <>
      <div className="row-between"><h2 className="h3 serif">{t('mood.title')}</h2>{!mood && <button type="button" className="ghost" onClick={() => setSkipped(true)}>{t('mood.skip')}</button>}</div>
      <div className="faces" role="group" aria-label={t('mood.title')}>{moods.map(option => <button key={option} type="button" className={mood === option ? 'face on' : 'face'} aria-pressed={mood === option} onClick={() => { setChanging(false);setWords([]);setStep('words');void save(option,[]); }}><Face mood={option}/><span>{t(`mood.${option}`)}</span></button>)}</div>
    </> : step === 'words' ? <>
      <p className="q">{t('mood.words')} <span className="sm">{t('mood.optional')}</span></p>
      <div className="chips">{moodWords.map(word => <button key={word} type="button" className={words.includes(word) ? 'chip on' : 'chip'} aria-pressed={words.includes(word)} onClick={() => setWords(list => list.includes(word) ? list.filter(x => x !== word) : list.length < 3 ? [...list,word] : list)}>{t(`mood.word.${word}`)}</button>)}</div>
      <div className="row-between"><span className="sm">{t('mood.private')}</span><span className="chips"><button type="button" className="ghost" onClick={() => setStep('reply')}>{t('mood.skip')}</button><button type="button" className="btn small" onClick={() => { if (mood && words.length) void save(mood,words);setStep('reply'); }}>{t('mood.done')}</button></span></div>
    </> : mood && <div className="stack-sm" role="status">
      <h2 className="h3 serif">{t(`mood.reply.${mood}.t`)}</h2>
      <p className="p">{t(`mood.reply.${mood}.p`)}</p>
      {mood === 'REALLY_HARD' && <HelpButton/>}
      <div className="chips">{mood === 'GREAT' || mood === 'OKAY' ? null : <Link className="btn2" href="/discover">{t('mood.findPeople')}</Link>}<button type="button" className="ghost" onClick={() => setStep('ask')}>{t('common.close')}</button></div>
    </div>}
    {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
  </section>;
}

// In Profile: the last seven days. Empty days stay blank, and only the owner sees this.
export function MoodHistory() {
  const { lang,t } = useLang();
  const [state,setState] = useState<MoodState | null>(null),[error,setError] = useState('');
  const load = useCallback(() => { call<MoodState>('/mood').then(setState).catch(e => setError(codeOf(e))); },[]);
  useEffect(load,[load]);
  const download = async () => {
    try {
      const rows = await call<unknown>('/mood/export');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{ type: 'application/json' }));
      link.download = 'sandar-mood.json';link.click();URL.revokeObjectURL(link.href);
    } catch (e) { setError(codeOf(e)); }
  };
  const remove = async () => {
    if (!window.confirm(t('mood.deleteConfirm'))) return;
    try { setState(await call<MoodState>('/mood',{ method: 'DELETE' })); } catch (e) { setError(codeOf(e)); }
  };
  if (!state) return null;
  return <section className="set-card stack" aria-label={t('mood.history')}>
    <div className="row-between"><h2 className="q">{t('mood.history')}</h2><span className="sm">{t('mood.private')}</span></div>
    <ol className="mood-week">{state.week.map(d => <li key={d.day}>{d.mood ? <Face mood={d.mood} size={36}/> : <span className="mood-blank" aria-hidden="true"/>}<span className="sm">{new Date(`${d.day}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID',{ weekday: 'short' })}</span><span className="visually-hidden">{d.mood ? t(`mood.${d.mood}`) : t('mood.none')}</span></li>)}</ol>
    {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
    <div className="chips"><button type="button" className="ghost" onClick={() => void download()}>{t('mood.download')}</button><button type="button" className="ghost" onClick={() => void remove()}>{t('mood.delete')}</button></div>
  </section>;
}
