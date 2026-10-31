'use client';
import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';

// Shared pieces of the Senja design (WA-01d, WA-03b, WA-04b, WA-09).

export function Wordmark({ size = 24 }: { size?: number }) {
  return <span className="wm" style={{ fontSize: size }} aria-label="Sandar">sandar<i aria-hidden="true"/></span>;
}

const pastels = ['#C9D4EE','#F7CBD1','#CFE3D4','#FFE2A3','#FCEBDD'];
/** Pastel circle with an initial. Anonymous authors get a colour but no initial. */
export function Avatar({ name,seed,size = 38 }: { name?: string | null; seed: string; size?: number }) {
  let sum = 0;
  for (const char of seed) sum = (sum + char.charCodeAt(0)) % 997;
  return <span className="av" aria-hidden="true" style={{ width: size,height: size,background: pastels[sum % pastels.length] }}>{name ? name.trim().slice(0,1).toUpperCase() : ''}</span>;
}

// In-house illustration: two people sitting back to back on a hill, leaning on each other.
const scene = "<defs><linearGradient id=\"skyg\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#FCEBDD\" stop-opacity=\"0\"/><stop offset=\"1\" stop-color=\"#FBE2D0\"/></linearGradient></defs><rect width=\"460\" height=\"420\" fill=\"url(#skyg)\"/><circle class=\"halo\" cx=\"300\" cy=\"170\" r=\"112\" fill=\"#FFE7B0\" opacity=\".35\"/><circle cx=\"300\" cy=\"170\" r=\"72\" fill=\"#FFE2A3\"/><path d=\"M60 90q8-8 16 0q8-8 16 0\" fill=\"none\" stroke=\"#D9B8A8\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path d=\"M108 66q6-6 12 0q6-6 12 0\" fill=\"none\" stroke=\"#D9B8A8\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M0 232C90 192 170 212 240 230S380 200 460 214V420H0Z\" fill=\"#FAD3BC\"/><path d=\"M0 284C100 244 200 272 280 286S420 256 460 266V420H0Z\" fill=\"#F6BFA6\"/><path d=\"M0 346C120 304 300 304 460 350V420H0Z\" fill=\"#CFE3D4\"/><ellipse cx=\"240\" cy=\"314\" rx=\"78\" ry=\"7\" fill=\"#B7D3BF\" opacity=\".7\"/><polyline points=\"214,306 186,284 172,311\" fill=\"none\" stroke=\"#B9C7E6\" stroke-width=\"15\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M204 313Q206 280 219 257Q232 249 240 262Q238 291 234 313Z\" fill=\"#C9D4EE\"/><path d=\"M222 270L190 287\" stroke=\"#C9D4EE\" stroke-width=\"9\" stroke-linecap=\"round\"/><circle cx=\"217\" cy=\"241\" r=\"14\" fill=\"#F2CDB4\"/><path d=\"M203 240a14 14 0 0 1 28-2q-8-6-16-3q-6 1-12 5z\" fill=\"#B99A8C\"/><polyline points=\"266,306 294,284 308,311\" fill=\"none\" stroke=\"#F2B9C2\" stroke-width=\"15\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M276 313Q274 280 261 257Q248 249 240 262Q242 291 246 313Z\" fill=\"#F7CBD1\"/><path d=\"M258 271L294 280\" stroke=\"#F7CBD1\" stroke-width=\"9\" stroke-linecap=\"round\"/><rect x=\"292\" y=\"270\" width=\"12\" height=\"14\" rx=\"3\" fill=\"#FFFFFF\"/><path class=\"steam\" d=\"M298 264q-5-6 0-12q5-6 0-12\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\".9\"/><circle cx=\"263\" cy=\"241\" r=\"14\" fill=\"#EBC0A6\"/><path d=\"M249 238a14 14 0 0 1 28 0q-6-8-14-8q-9 0-14 8z\" fill=\"#C7A497\"/><circle cx=\"275\" cy=\"229\" r=\"6\" fill=\"#C7A497\"/><circle cx=\"392\" cy=\"98\" r=\"2.4\" fill=\"#FFFFFF\" opacity=\".9\"/><circle cx=\"160\" cy=\"140\" r=\"1.8\" fill=\"#FFFFFF\" opacity=\".8\"/><circle cx=\"420\" cy=\"150\" r=\"1.6\" fill=\"#FFFFFF\" opacity=\".7\"/>";
export function Illustration({ className = 'illu' }: { className?: string }) {
  const { t } = useLang();
  return <svg className={className} viewBox="0 0 460 420" preserveAspectRatio="xMidYMax slice" role="img" aria-label={t('auth.illustration')} dangerouslySetInnerHTML={{ __html: scene }}/>;
}

/** Warm placeholder shaped like the page. Appears only if loading takes longer than 300 ms. */
export function Skeleton({ label,variant = 'feed' }: { label: string; variant?: 'feed' | 'page' }) {
  const [shown,setShown] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setShown(true),300);return () => clearTimeout(timer); },[]);
  if (!shown) return <span className="visually-hidden" role="status">{label}</span>;
  return <div className="skeleton" role="status" aria-label={label}>
    <span className="sk sk-line short"/><span className="sk sk-title"/>
    {variant === 'feed' && <span className="sk sk-bar"/>}
    {[0,1,2].map(n => <div key={n} className="sk-card"><span className="sk sk-av"/><div className="sk-col"><span className="sk sk-line short"/><span className="sk sk-line"/><span className="sk sk-line mid"/></div></div>)}
  </div>;
}

/** Shown instead of publishing text that mentions self-harm or suicide. */
export function SafetyModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('a')?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[onClose]);
  return <div className="scrim" onClick={onClose}>
    <div ref={box} className="modal safety" role="alertdialog" aria-modal="true" aria-labelledby="safety-title" aria-describedby="safety-text" onClick={event => event.stopPropagation()}>
      <h2 id="safety-title" className="serif">{t('safety.title')}</h2>
      <p id="safety-text" className="p">{t('safety.p')}</p>
      <a className="resource" href="https://healing119.id" target="_blank" rel="noreferrer"><strong>{t('help.crisis')}</strong><span className="sm">{t('help.crisis.sub')}</span></a>
      <a className="resource" href="tel:119"><strong>{t('help.emergency')}</strong><span className="sm">{t('help.emergency.sub')}</span></a>
      <div className="modal-actions"><span/><button type="button" className="btn2" onClick={onClose}>{t('safety.back')}</button></div>
    </div>
  </div>;
}
