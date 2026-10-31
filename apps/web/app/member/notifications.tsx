'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { MemberNotification } from '../../../../packages/contracts/src/member';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, timeAgo } from './copy';
import { Skeleton } from './ui';

export function Notifications() {
  const { lang,t } = useLang();
  const [list,setList] = useState<MemberNotification[] | null>(null),[error,setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      setList(await call<MemberNotification[]>('/notifications'));
      void call('/notifications/seen',{ method: 'POST',body: {} }).catch(() => {});
    } catch (e) { setError(codeOf(e)); }
  },[]);
  useEffect(() => { void load(); },[load]);
  if (error) return <div className="empty"><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div>;
  if (!list) return <Skeleton label={t('loading.page')} variant="page"/>;
  return <div className="stack-lg narrow wide-ish">
    <h1 className="display serif">{t('nav.notifications')}</h1>
    {!list.length ? <div className="dashed"><strong className="serif">{t('notif.empty.t')}</strong><p className="sm">{t('notif.empty.p')}</p></div>
      : <ul className="mini-list">{list.map(n => <li key={n.id}><Link href={`/spaces/${n.spaceId}`} className={n.unread ? 'notif unread' : 'notif'}>
        <span className="grow">{n.kind === 'REPLY' ? t('notif.reply',{ who: n.actor ?? '',space: n.spaceName }) : t('notif.reviewed',{ space: n.spaceName,status: t(`cs.status.${n.status as 'ACTIVE'}`) })}</span>
        <span className="sm">{timeAgo(n.at,lang,t)}</span>
      </Link></li>)}</ul>}
  </div>;
}
