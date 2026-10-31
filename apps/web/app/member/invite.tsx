'use client';
import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { Illustration } from './ui';

const friendKeys = ['pace','private','listen','away','outside'] as const;
const hostKeys = ['tone','host','details','anon','alone'] as const;

// The boundaries in plain words: shown before starting or joining, and kept in Settings and on each space.
export function Boundaries() {
  const { t } = useLang();
  return <div className="bound-cols">
    <section className="stack-sm"><h3 className="q">{t('bound.friends')}</h3><ul className="bound-list">{friendKeys.map(key => <li key={key}><b>{t(`bound.f.${key}.t`)}</b> {t(`bound.f.${key}.p`)}</li>)}</ul></section>
    <section className="stack-sm"><h3 className="q">{t('bound.hosting')}</h3><ul className="bound-list">{hostKeys.map(key => <li key={key}><b>{t(`bound.h.${key}.t`)}</b> {t(`bound.h.${key}.p`)}</li>)}</ul></section>
  </div>;
}

// WA-02c: shown once, on the first visit to Home. Two equal choices, and it can always be skipped.
export function SpaceInvite({ name,onStart,onClose }: { name: string; onStart: () => void; onClose: () => void }) {
  const { t } = useLang();
  const [boundaries,setBoundaries] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown',key);
    return () => document.removeEventListener('keydown',key);
  },[onClose]);
  if (boundaries) return <div className="scrim compose-scrim">
    <div className="modal invite-modal wide" role="dialog" aria-modal="true" aria-labelledby="bound-title">
      <button type="button" className="ghost fit" onClick={() => setBoundaries(false)}>{t('common.back')}</button>
      <h2 id="bound-title" className="serif">{t('bound.title')}</h2>
      <Boundaries/>
      <p className="sm">{t('bound.foot')}</p>
      <div className="modal-actions"><a className="btn2" href="/discover">{t('invite.find')}</a><button type="button" className="btn" onClick={onStart}>{t('invite.startMine')}</button></div>
    </div>
  </div>;
  return <div className="scrim compose-scrim">
    <div className="modal invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="invite-art" aria-hidden="true"><Illustration className="illu static"/></div>
      <p className="sm">{t('invite.hello',{ name })}</p>
      <h2 id="invite-title" className="serif">{t('invite.title')}</h2>
      <p className="p">{t('invite.lead')}</p>
      <div className="invite-choices">
        <button type="button" className="choice" onClick={() => setBoundaries(true)}><b className="serif">{t('invite.join')}</b><span className="sm">{t('invite.join.p')}</span></button>
        <button type="button" className="choice" onClick={() => setBoundaries(true)}><b className="serif">{t('invite.start')}</b><span className="sm">{t('invite.start.p')}</span></button>
      </div>
      <button type="button" className="ghost fit center" onClick={onClose}>{t('invite.later')}</button>
    </div>
  </div>;
}
