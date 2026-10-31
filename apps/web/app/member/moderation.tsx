'use client';
import { useCallback, useEffect, useState } from 'react';
import { moderationRules, type ModerationQueue } from '../../../../packages/contracts/src/moderation';
import { useLang } from '../i18n';
import { call, codeOf } from './client';
import { errorKey, timeAgo } from './copy';
import { Skeleton } from './ui';

const ruleLabel = { RULE_1: 'rule.1', RULE_2: 'rule.2', RULE_3: 'rule.3', RULE_4: 'rule.4', RULE_5: 'rule.5', OTHER: 'mod.rule.OTHER' } as const;

// Review queue for Sandar moderators. The server decides who may see it.
export function Moderation() {
  const { lang,t } = useLang();
  const [queue,setQueue] = useState<ModerationQueue | null>(null),[error,setError] = useState(''),[notice,setNotice] = useState(''),[busy,setBusy] = useState<string | null>(null);
  const [rules,setRules] = useState<Record<string,string>>({});
  const load = useCallback(async () => {
    setError('');
    try { setQueue(await call<ModerationQueue>('/moderation/queue')); } catch (e) { setError(codeOf(e)); }
  },[]);
  useEffect(() => { void load(); },[load]);

  async function act(key: string,path: string,body: unknown,message: string) {
    if (busy) return;
    setBusy(key);setError('');setNotice('');
    try { await call(path,{ method: 'POST',body });setNotice(message);await load(); }
    catch (e) { setError(codeOf(e)); }
    finally { setBusy(null); }
  }
  const decide = (postId: string,decision: 'APPROVE' | 'REMOVE') => act(postId,`/moderation/posts/${postId}/decision`,
    decision === 'APPROVE' ? { decision } : { decision,rule: rules[postId] },decision === 'APPROVE' ? t('mod.approved') : t('mod.removed'));

  if (error === 'FORBIDDEN') return <div className="empty"><h1 className="h serif">{t('mod.title')}</h1><p className="p">{t('mod.notAllowed')}</p></div>;
  if (!queue) return error ? <div className="empty"><p className="p">{t(errorKey(error))}</p><button className="btn" onClick={() => void load()}>{t('common.tryAgain')}</button></div> : <Skeleton label={t('loading.page')} variant="page"/>;

  const ruleSelect = (id: string) => <label className="lbl compact">{t('mod.rule')}<select className="in" value={rules[id] ?? ''} onChange={e => setRules(r => ({ ...r,[id]: e.target.value }))}>
    <option value="">{t('mod.rule.choose')}</option>{moderationRules.map(rule => <option key={rule} value={rule}>{t(ruleLabel[rule])}</option>)}
  </select></label>;
  return <div className="stack-lg narrow wide-ish">
    <header className="stack-sm"><h1 className="display serif">{t('mod.title')}</h1><p className="p">{t('mod.lead')}</p></header>
    <p className="alert a-warn">{t('mod.safety')}</p>
    {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
    {notice && <p className="alert a-ok" role="status">{notice}</p>}

    <section className="stack">
      <div className="row-between"><h2 className="kk">{t('mod.pending')} · {queue.posts.length}</h2><button className="link-button" onClick={() => void load()}>{t('common.reload')}</button></div>
      {!queue.posts.length && <p className="sm">{t('mod.noPending')}</p>}
      <ul className="mod-list">{queue.posts.map(p => <li key={p.postId} className="mod-item">
        <p className="sm">{p.highConcern && <span className="tag-review urgent">{t('mod.highConcern')}</span>} {t('mod.postMeta',{ author: p.authorName ?? t('mod.anon'),space: p.spaceName })} · {timeAgo(p.createdAt,lang,t)}</p>
        <p className="p mod-body">{p.body}</p>
        <div className="mod-actions">
          <button className="btn" onClick={() => void decide(p.postId,'APPROVE')} disabled={busy !== null}>{t('mod.approve')}</button>
          {ruleSelect(p.postId)}
          <button className="btn2" onClick={() => void decide(p.postId,'REMOVE')} disabled={busy !== null || !rules[p.postId]}>{t('mod.remove')}</button>
        </div>
      </li>)}</ul>
    </section>

    <section className="stack">
      <h2 className="kk">{t('mod.reports')} · {queue.reports.length}</h2>
      {!queue.reports.length && <p className="sm">{t('mod.noReports')}</p>}
      <ul className="mod-list">{queue.reports.map(r => <li key={r.reportId} className="mod-item">
        <p className="sm">{t('mod.reportMeta',{ reason: t(`report.${r.reason}`),n: r.reportsOnPost,space: r.spaceName })} · {timeAgo(r.createdAt,lang,t)}</p>
        <p className="p mod-body">{r.postBody}</p>
        <div className="mod-actions">
          <button className="btn2" onClick={() => void act(r.reportId,`/moderation/reports/${r.reportId}/dismiss`,{},t('mod.dismissed'))} disabled={busy !== null}>{t('mod.dismiss')}</button>
          {ruleSelect(r.postId)}
          <button className="btn" onClick={() => void decide(r.postId,'REMOVE')} disabled={busy !== null || !rules[r.postId]}>{t('mod.removePost')}</button>
        </div>
      </li>)}</ul>
    </section>
  </div>;
}
