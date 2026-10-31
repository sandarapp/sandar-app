'use client';
import { useCallback, useEffect, useState } from 'react';
import { ClientError } from '../../../../packages/auth-client/src/client';
import { moderationRules, type ModerationQueue } from '../../../../packages/contracts/src/moderation';
import { staffRoles, type OpsAuditEntry, type OpsDashboard, type OpsFeedback, type OpsMe, type OpsMember, type OpsReport, type OpsStaff, type StaffRole } from '../../../../packages/contracts/src/ops';
import { LangSwitch, useLang } from '../i18n';
import { call, codeOf, memberClient } from '../member/client';
import { errorKey, label, timeAgo } from '../member/copy';
import { Skeleton, Wordmark } from '../member/ui';

type Section = 'dashboard' | 'reports' | 'spaces' | 'members' | 'feedback' | 'staff' | 'audit';
const access: Record<Section,readonly StaffRole[]> = {
  dashboard: staffRoles,reports: ['MODERATOR'],spaces: ['MODERATOR'],members: staffRoles,feedback: ['ADMIN','SUPER_ADMIN'],staff: ['SUPER_ADMIN'],audit: ['SUPER_ADMIN']
};
const groups: [string | null,Section[]][] = [[null,['dashboard']],['ops.group.review',['reports','spaces']],['ops.group.people',['members','feedback']],['ops.group.admin',['staff','audit']]];
const ruleLabel = { RULE_1: 'rule.1',RULE_2: 'rule.2',RULE_3: 'rule.3',RULE_4: 'rule.4',RULE_5: 'rule.5',OTHER: 'mod.rule.OTHER' } as const;

async function signOut() {
  try { await memberClient().logout(); } catch { /* The server clears the cookie; go to login either way. */ }
  window.location.assign('/login');
}

// Sandar Ops. The menu follows the role, but the API checks every request itself.
export function OpsApp({ appUrl }: { appUrl: string }) {
  const { t } = useLang();
  const [me,setMe] = useState<OpsMe | null>(null),[state,setState] = useState<'loading' | 'denied' | 'failed' | 'ready'>('loading'),[section,setSection] = useState<Section>('dashboard');
  const load = useCallback(async () => {
    try { setMe(await call<OpsMe>('/ops/me'));setState('ready'); }
    catch (e) {
      if (e instanceof ClientError && e.status === 401) return window.location.replace('/login');
      setState(codeOf(e) === 'FORBIDDEN' ? 'denied' : 'failed');
    }
  },[]);
  useEffect(() => { void load(); },[load]);
  if (state === 'loading') return <main className="bare"><Skeleton label={t('loading.page')}/></main>;
  if (state === 'denied') return <main className="ops-gate"><div className="ops-card stack"><Wordmark/><h1 className="ops-h">{t('ops.denied.t')}</h1><p className="sm">{t('ops.denied.p')}</p><a className="ops-btn2 fit" href={appUrl}>{t('ops.backApp')}</a><button type="button" className="ops-btn2 fit" onClick={() => void signOut()}>{t('common.logout')}</button></div></main>;
  if (state === 'failed' || !me) return <main className="ops-gate"><div className="ops-card stack"><p className="p">{t('shell.loadFail')}</p><button className="ops-btn fit" onClick={() => void load()}>{t('common.tryAgain')}</button></div></main>;
  if (me.twoFactor !== 'OK') return <TwoFactor email={me.email} appUrl={appUrl} onDone={() => void load()}/>;
  const allowed = (s: Section) => access[s].some(role => me.roles.includes(role));
  const expired = () => void load();
  return <div className="ops">
    <nav className="ops-side" aria-label="Sandar Ops">
      <span className="ops-brand"><Wordmark/><b>OPS</b></span>
      {groups.map(([name,items]) => {
        const shown = items.filter(allowed);
        return shown.length ? <div key={name ?? 'top'} className="stack-xs">{name && <p className="ops-g">{t(name as 'ops.group.review')}</p>}{shown.map(s => <button key={s} type="button" className={section === s ? 'ops-mi on' : 'ops-mi'} aria-current={section === s ? 'page' : undefined} onClick={() => setSection(s)}>{t(`ops.nav.${s}`)}</button>)}</div> : null;
      })}
      <span className="grow"/>
      <a className="ops-mi" href={appUrl}>{t('ops.backApp')}</a>
      <button type="button" className="ops-mi" onClick={() => void signOut()}>{t('common.logout')}</button>
    </nav>
    <div className="ops-main">
      <header className="ops-top"><b>{t(`ops.nav.${section}`)}</b><span className="grow"/><LangSwitch/><span className="ops-role">{me.roles.map(r => t(`ops.role.${r}`)).join(' · ')}</span><span>{me.name}</span></header>
      <main className="ops-body">
        {section === 'dashboard' && <Dashboard me={me} go={setSection} onExpired={expired}/>}
        {section === 'reports' && <Reports onExpired={expired}/>}
        {section === 'spaces' && <Spaces onExpired={expired}/>}
        {section === 'members' && <Members me={me} onExpired={expired}/>}
        {section === 'feedback' && <Feedback onExpired={expired}/>}
        {section === 'staff' && <Staff onExpired={expired}/>}
        {section === 'audit' && <Audit onExpired={expired}/>}
      </main>
    </div>
  </div>;
}

// The code is sent only when asked for, so reloading this page can't replace one on its way.
function TwoFactor({ email,appUrl,onDone }: { email: string; appUrl: string; onDone: () => void }) {
  const { t } = useLang();
  const [sent,setSent] = useState(false),[code,setCode] = useState(''),[error,setError] = useState(''),[busy,setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    setBusy(true);setError('');setCode('');
    try { await call('/ops/2fa/send',{ method: 'POST',body: {} });setSent(true); }
    catch (e) { setError(codeOf(e)); } finally { setBusy(false); }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);setError('');
    try { await call('/ops/2fa/verify',{ method: 'POST',body: { code } });onDone(); }
    catch (e) { setCode('');setError(codeOf(e)); } finally { setBusy(false); }
  };
  return <main className="ops-gate"><form className="ops-card stack" onSubmit={verify}>
    <span className="ops-brand dark"><Wordmark/><b>OPS</b></span>
    <h1 className="ops-h">{t('ops.code.title')}</h1>
    <p className="sm">{sent ? t('ops.code.sent',{ email }) : t('ops.code.p',{ email })}</p>
    {sent && <label className="lbl">{t('ops.code.label')}<input className="in" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}/></label>}
    {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
    {sent ? <><button className="ops-btn" type="submit" disabled={busy || code.length !== 6}>{t('ops.code.verify')}</button><button type="button" className="ops-btn2" disabled={busy} onClick={() => void send()}>{t('ops.code.again')}</button></>
      : <button type="button" className="ops-btn" disabled={busy} onClick={() => void send()}>{busy ? t('common.working') : t('ops.code.send')}</button>}
    <a className="sm-link" href={appUrl}>{t('ops.backApp')}</a>
  </form></main>;
}

// Loads one section; a lapsed second factor sends staff back to the code screen.
function useOps<T>(path: string,onExpired: () => void) {
  const { t } = useLang();
  const [data,setData] = useState<T | null>(null),[error,setError] = useState(''),[notice,setNotice] = useState('');
  const fail = useCallback((e: unknown) => { const code = codeOf(e);if (code === 'OPS_2FA_REQUIRED') onExpired();else setError(code); },[onExpired]);
  const load = useCallback(async () => {
    setError('');
    try { setData(await call<T>(path)); } catch (e) { fail(e); }
  },[path,fail]);
  useEffect(() => { void load(); },[load]);
  const act = useCallback(async (actionPath: string,body: unknown,done: string) => {
    setError('');setNotice('');
    try { await call(actionPath,{ method: 'POST',body });setNotice(done);await load();return true; } catch (e) { fail(e);return false; }
  },[load,fail]);
  const messages = <>{error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}{notice && <p className="alert a-ok" role="status">{notice}</p>}</>;
  return { data,act,messages,error,reload: load };
}

function Tile({ label: name,value,note,onClick }: { label: string; value: number; note?: string; onClick?: () => void }) {
  const body = <><span className="ops-k">{name}</span><b>{value}</b>{note && <span className="sm">{note}</span>}</>;
  return onClick ? <button type="button" className="ops-tile link" onClick={onClick}>{body}</button> : <div className="ops-tile">{body}</div>;
}
function Dashboard({ me,go,onExpired }: { me: OpsMe; go: (s: Section) => void; onExpired: () => void }) {
  const { t } = useLang();
  const { data,messages } = useOps<OpsDashboard>('/ops/dashboard',onExpired);
  if (!data) return <>{messages}<Skeleton label={t('loading.page')} variant="page"/></>;
  const reviewer = me.roles.includes('MODERATOR');
  return <div className="stack">
    {messages}
    <h1 className="ops-h">{t('ops.hello',{ name: me.name })}</h1>
    {reviewer && <div className="ops-tiles"><Tile label={t('ops.tile.reports')} value={data.reports} onClick={() => go('reports')}/><Tile label={t('ops.tile.spaces')} value={data.spaces} note={t('ops.tile.spaces.p')} onClick={() => go('spaces')}/></div>}
    {data.members !== null && <div className="ops-tiles">
      <Tile label={t('ops.tile.feedback')} value={data.feedback ?? 0} onClick={() => go('feedback')}/>
      <Tile label={t('ops.tile.members')} value={data.members} note={t('ops.tile.new',{ n: data.newMembers ?? 0 })}/>
      <Tile label={t('ops.tile.posts')} value={data.posts7d ?? 0}/>
      <Tile label={t('ops.tile.interest')} value={data.eventInterest ?? 0} note={t('ops.tile.interest.p')}/>
      <Tile label={t('ops.tile.helpful')} value={data.helpful?.yes ?? 0} note={t('ops.tile.helpful.p',{ n: data.helpful?.no ?? 0 })}/>
    </div>}
    <p className="sm">{t('ops.moodNote')}</p>
  </div>;
}

function Reports({ onExpired }: { onExpired: () => void }) {
  const { lang,t } = useLang();
  const { data,act,messages } = useOps<OpsReport[]>('/ops/reports',onExpired);
  const [rules,setRules] = useState<Record<string,string>>({}),[busy,setBusy] = useState(false);
  if (!data) return <>{messages}<Skeleton label={t('loading.page')} variant="page"/></>;
  const decide = async (r: OpsReport,outcome: 'DISMISS' | 'REMOVE') => {
    setBusy(true);
    await act('/ops/reports/decision',outcome === 'REMOVE' ? { outcome,type: r.type,id: r.id,rule: rules[r.id] } : { outcome,type: r.type,id: r.id },outcome === 'REMOVE' ? t('mod.removed') : t('mod.dismissed'));
    setBusy(false);
  };
  return <div className="stack">
    {messages}
    <p className="alert a-warn">{t('mod.safety')}</p>
    {!data.length ? <p className="ops-empty">{t('mod.noReports')}</p> : <ul className="mod-list">{data.map(r => <li key={r.id} className="mod-item">
      <p className="sm"><span className={`ops-chip ${r.severity}`}>{t(`ops.sev.${r.severity}`)}</span> {t(`ops.type.${r.type}`)} · {r.spaceName} · {r.reasons.map(x => t(`report.${x as 'OTHER'}`)).join(', ')} · {t('ops.count',{ n: r.count })} · {timeAgo(r.createdAt,lang,t)}</p>
      <p className="p mod-body">{r.body}</p>
      <p className="sm">{t('ops.author')}: {r.author ?? t('mod.anon')}</p>
      <div className="mod-actions">
        <button type="button" className="ops-btn2" disabled={busy} onClick={() => void decide(r,'DISMISS')}>{t('mod.dismiss')}</button>
        <label className="lbl compact">{t('mod.rule')}<select className="in" value={rules[r.id] ?? ''} onChange={e => setRules(x => ({ ...x,[r.id]: e.target.value }))}><option value="">{t('mod.rule.choose')}</option>{moderationRules.map(rule => <option key={rule} value={rule}>{t(ruleLabel[rule])}</option>)}</select></label>
        <button type="button" className="ops-danger" disabled={busy || !rules[r.id]} onClick={() => void decide(r,'REMOVE')}>{t('ops.remove')}</button>
      </div>
    </li>)}</ul>}
  </div>;
}

function Spaces({ onExpired }: { onExpired: () => void }) {
  const { lang,t } = useLang();
  const { data,act,messages } = useOps<ModerationQueue>('/moderation/queue',onExpired);
  const [notes,setNotes] = useState<Record<string,string>>({}),[busy,setBusy] = useState(false);
  if (!data) return <>{messages}<Skeleton label={t('loading.page')} variant="page"/></>;
  const decide = async (id: string,body: unknown,done: string) => { setBusy(true);await act(`/moderation/spaces/${id}/decision`,body,done);setBusy(false); };
  return <div className="stack">
    {messages}
    {!data.spaces.length ? <p className="ops-empty">{t('mod.noSpaces')}</p> : <ul className="mod-list">{data.spaces.map(s => {
      const note = notes[s.spaceId]?.trim() ?? '';
      return <li key={s.spaceId} className="mod-item">
        <p className="sm">{t('mod.spaceMeta',{ host: s.hostName })} · {timeAgo(s.createdAt,lang,t)}</p>
        <strong>{s.name}</strong>
        <p className="p mod-body">{s.purpose}</p>
        <p className="sm">{s.topics.map(x => label(lang,x)).join(' · ')} · {s.anonymousAllowed ? t('cs.preview.anon') : t('cs.preview.named')}</p>
        <ol className="rules">{s.rules.map((rule,i) => <li key={i}>{rule}</li>)}</ol>
        <label className="lbl compact">{t('mod.spaceNote')}<textarea className="ta" rows={2} maxLength={300} value={notes[s.spaceId] ?? ''} onChange={e => setNotes(n => ({ ...n,[s.spaceId]: e.target.value }))}/></label>
        <div className="mod-actions">
          <button type="button" className="ops-btn" disabled={busy} onClick={() => void decide(s.spaceId,{ decision: 'APPROVE' },t('mod.spaceApproved'))}>{t('mod.approve')}</button>
          <button type="button" className="ops-btn2" disabled={busy || note.length < 5} onClick={() => void decide(s.spaceId,{ decision: 'CHANGES',note },t('mod.spaceSentBack'))}>{t('mod.spaceChanges')}</button>
          <button type="button" className="ops-danger" disabled={busy || note.length < 5} onClick={() => void decide(s.spaceId,{ decision: 'REJECT',note },t('mod.spaceRejected'))}>{t('mod.spaceReject')}</button>
        </div>
      </li>;
    })}</ul>}
  </div>;
}

// No directory: one exact lookup at a time, and each one is logged.
function Members({ me,onExpired }: { me: OpsMe; onExpired: () => void }) {
  const { lang,t } = useLang();
  const [query,setQuery] = useState(''),[reason,setReason] = useState(''),[member,setMember] = useState<OpsMember | null>(null),[error,setError] = useState(''),[notice,setNotice] = useState(''),[why,setWhy] = useState(''),[busy,setBusy] = useState(false);
  const admin = me.roles.includes('ADMIN') || me.roles.includes('SUPER_ADMIN'),email = query.includes('@');
  const fail = (e: unknown) => { const code = codeOf(e);if (code === 'OPS_2FA_REQUIRED') onExpired();else setError(code); };
  const lookup = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);setError('');setNotice('');setMember(null);
    try { setMember(await call<OpsMember>('/ops/members/lookup',{ method: 'POST',body: email ? { email: query.trim(),reason: reason.trim() } : { id: query.trim() } })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const change = async (action: 'suspend' | 'restore') => {
    if (!member) return;
    setBusy(true);setError('');
    try {
      await call(`/ops/members/${member.id}/${action}`,{ method: 'POST',body: { reason: why.trim() } });
      setMember(await call<OpsMember>('/ops/members/lookup',{ method: 'POST',body: { id: member.id } }));
      setWhy('');setNotice(t('ops.saved'));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return <div className="stack ops-narrow">
    <form className="ops-panel stack-sm" onSubmit={lookup}>
      <label className="lbl">{t('ops.lookup')}<input className="in" value={query} maxLength={254} onChange={e => setQuery(e.target.value)}/><span className="hint">{admin ? t('ops.lookup.admin') : t('ops.lookup.mod')}</span></label>
      {email && <label className="lbl">{t('ops.reason')}<input className="in" value={reason} maxLength={300} onChange={e => setReason(e.target.value)}/></label>}
      <button className="ops-btn fit" type="submit" disabled={busy || !query.trim() || (email && reason.trim().length < 5)}>{t('ops.lookup.go')}</button>
    </form>
    {error && <p className="alert a-err" role="alert">{t(errorKey(error))}</p>}
    {notice && <p className="alert a-ok" role="status">{notice}</p>}
    {member && <section className="ops-panel stack-sm">
      <h2 className="q">{member.displayName ?? t('mod.anon')} <span className={`ops-chip ${member.status === 'SUSPENDED' ? 'HIGH' : 'OK'}`}>{member.status}</span></h2>
      <dl className="ops-dl">
        <dt>ID</dt><dd>{member.id}</dd><dt>Email</dt><dd>{member.email}</dd>
        <dt>{t('ops.joined')}</dt><dd>{new Date(member.joinedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID')}</dd>
        <dt>{t('nav.mine')}</dt><dd>{member.spaces}</dd><dt>{t('ops.namedPosts')}</dt><dd>{member.namedPosts}</dd><dt>{t('ops.reportsOn')}</dt><dd>{member.reportsOnNamedPosts}</dd>
      </dl>
      <p className="sm">{t('ops.notShown')}</p>
      {admin && <>
        <label className="lbl">{t('ops.reason')}<input className="in" value={why} maxLength={300} onChange={e => setWhy(e.target.value)}/></label>
        {member.status === 'SUSPENDED' ? <button type="button" className="ops-btn2 fit" disabled={busy || why.trim().length < 5} onClick={() => void change('restore')}>{t('ops.restore')}</button> : <button type="button" className="ops-danger fit" disabled={busy || why.trim().length < 5} onClick={() => void change('suspend')}>{t('ops.suspend')}</button>}
      </>}
    </section>}
  </div>;
}

function Feedback({ onExpired }: { onExpired: () => void }) {
  const { lang,t } = useLang();
  const { data,act,messages } = useOps<OpsFeedback[]>('/ops/feedback',onExpired);
  if (!data) return <>{messages}<Skeleton label={t('loading.page')} variant="page"/></>;
  return <div className="stack">
    {messages}
    {!data.length ? <p className="ops-empty">{t('ops.noFeedback')}</p> : <ul className="mod-list">{data.map(f => <li key={f.id} className={f.status === 'NEW' ? 'mod-item unread' : 'mod-item'}>
      <p className="sm"><b>{t(`ops.fb.${f.kind as 'IDEA'}`)}</b> · {f.page ?? f.moment ?? '-'} · {f.device} · {timeAgo(f.createdAt,lang,t)}</p>
      <p className="p mod-body">{f.body}</p>
      <div className="row-between"><span className="sm">{f.contactEmail ? <a href={`mailto:${f.contactEmail}`}>{f.contactEmail}</a> : t('ops.noContact')}</span>{f.status === 'NEW' && <button type="button" className="ops-btn2" onClick={() => void act(`/ops/feedback/${f.id}/read`,{},t('ops.saved'))}>{t('ops.markRead')}</button>}</div>
    </li>)}</ul>}
  </div>;
}

function Staff({ onExpired }: { onExpired: () => void }) {
  const { lang,t } = useLang();
  const { data,act,messages } = useOps<OpsStaff[]>('/ops/staff',onExpired);
  const [email,setEmail] = useState(''),[role,setRole] = useState<StaffRole>('MODERATOR'),[reason,setReason] = useState('');
  if (!data) return <>{messages}<Skeleton label={t('loading.page')} variant="page"/></>;
  const asked = (): string | null => { const r = window.prompt(t('ops.reason'));return r && r.trim().length >= 5 ? r.trim() : null; };
  const grant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await act('/ops/staff/grant',{ email: email.trim(),role,reason: reason.trim() },t('ops.saved'))) { setEmail('');setReason(''); }
  };
  return <div className="stack">
    {messages}
    <div className="ops-panel table-wrap"><table className="ops-table"><thead><tr><th>{t('ops.name')}</th><th>{t('ops.roles')}</th><th>{t('ops.until')}</th><th/></tr></thead><tbody>{data.map(s => <tr key={s.userId}>
      <td>{s.name}<span className="sm block">{s.email}</span></td>
      <td>{s.grants.map(g => <button key={g.role} type="button" className="ops-chip LOW tag-btn" title={t('ops.revokeRole')} onClick={() => { const r = asked();if (r) void act('/ops/staff/revoke',{ userId: s.userId,role: g.role,reason: r },t('ops.saved')); }}>{t(`ops.role.${g.role}`)} ×</button>)}</td>
      <td>{s.grants.map(g => g.expiresAt ? new Date(g.expiresAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'id-ID') : '-').join(', ')}</td>
      <td className="chips"><button type="button" className="ops-danger" onClick={() => { const r = asked();if (r) void act('/ops/staff/revoke',{ userId: s.userId,reason: r },t('ops.saved')); }}>{t('ops.removeAll')}</button></td>
    </tr>)}</tbody></table></div>
    <form className="ops-panel stack-sm ops-narrow" onSubmit={grant}>
      <h2 className="q">{t('ops.grant')}</h2><p className="sm">{t('ops.grant.p')}</p>
      <label className="lbl">Email<input className="in" type="email" value={email} onChange={e => setEmail(e.target.value)}/></label>
      <label className="lbl">{t('ops.roles')}<select className="in" value={role} onChange={e => setRole(e.target.value as StaffRole)}>{staffRoles.map(r => <option key={r} value={r}>{t(`ops.role.${r}`)}</option>)}</select></label>
      <label className="lbl">{t('ops.reason')}<input className="in" value={reason} maxLength={300} onChange={e => setReason(e.target.value)}/></label>
      <button className="ops-btn fit" type="submit" disabled={!email.includes('@') || reason.trim().length < 5}>{t('ops.grant')}</button>
    </form>
  </div>;
}

function Audit({ onExpired }: { onExpired: () => void }) {
  const { lang,t } = useLang();
  const { data,messages } = useOps<OpsAuditEntry[]>('/ops/audit',onExpired);
  const [q,setQ] = useState('');
  if (!data) return <>{messages}<Skeleton label={t('loading.page')} variant="page"/></>;
  const needle = q.trim().toLowerCase();
  const rows = data.filter(a => !needle || [a.actor,a.action,a.targetType,a.targetId].some(x => x.toLowerCase().includes(needle)));
  return <div className="stack">
    {messages}
    <p className="sm">{t('ops.audit.p')}</p>
    <input className="in ops-narrow" type="search" aria-label={t('search.label')} placeholder={t('search.label')} value={q} onChange={e => setQ(e.target.value)}/>
    <div className="ops-panel table-wrap"><table className="ops-table"><thead><tr><th>{t('ops.time')}</th><th>{t('ops.actor')}</th><th>{t('ops.action')}</th><th>{t('ops.object')}</th><th>{t('ops.reason')}</th></tr></thead><tbody>{rows.map(a => <tr key={a.id}>
      <td>{new Date(a.at).toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID')}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.targetType} {a.targetId.slice(0,8)}</td><td>{a.reason ?? '-'}</td>
    </tr>)}</tbody></table></div>
  </div>;
}
