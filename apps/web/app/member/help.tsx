'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';

// "Need help now?" dialog. Focus starts on the first resource, Tab stays inside,
// Esc closes and returns focus to the button that opened it.
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('a,button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>('a,button')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); opener?.focus(); };
  }, [onClose]);
  // Quick exit leaves for a neutral page and keeps Sandar out of the back button.
  const quickExit = () => window.location.replace('https://www.bmkg.go.id/');
  const lines = [
    { href: 'tel:119', title: t('help.emergency'), sub: t('help.emergency.sub') },
    { href: 'https://healing119.id', title: t('help.crisis'), sub: t('help.crisis.sub') },
    { href: 'tel:1500567', title: t('help.health'), sub: t('help.health.sub') }
  ];
  return <div className="scrim" onClick={onClose}>
    <div ref={box} className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={event => event.stopPropagation()}>
      <h2 id="help-title" className="serif">{t('help.title')}</h2>
      <p className="sm">{t('help.lead')}</p>
      {lines.map(line => <a key={line.href} className="resource" href={line.href} rel="noreferrer" target={line.href.startsWith('http') ? '_blank' : undefined}><strong>{line.title}</strong><span className="sm">{line.sub}</span></a>)}
      <p className="sm">{t('help.source')}</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={quickExit}>{t('help.quickExit')}</button><button type="button" className="btn2" onClick={onClose}>{t('help.back')}</button></div>
    </div>
  </div>;
}

export function HelpButton() {
  const { t } = useLang();
  const [open,setOpen] = useState(false);
  const close = useCallback(() => setOpen(false),[]);
  return <><button type="button" className="help" onClick={() => setOpen(true)}>{t('help.button')}</button>{open && <HelpDialog onClose={close}/>}</>;
}
