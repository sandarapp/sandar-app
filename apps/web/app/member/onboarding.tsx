'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { participationPreferences, supportInterests, type OnboardingState } from '../../../../packages/contracts/src/onboarding';
import { resumeStep, selectInterest } from '../../../../packages/auth-client/src/onboarding-flow';
import { call, codeOf } from './client';
import { errorText, guidelines, helpLines, labels } from './copy';

type Location = NonNullable<OnboardingState['location']>;
type Need = NonNullable<OnboardingState['preferences']>['needs'][number];
type Goal = NonNullable<OnboardingState['preferences']>['goals'][number];
type Format = NonNullable<OnboardingState['preferences']>['communityType'];
type Privacy = NonNullable<OnboardingState['privacy']>;

const LAST = 10;
const formats: Format[] = ['ONLINE','LOCAL','MIXED','NO_PREFERENCE'];
const emptyPrivacy: Privacy = { displayName: '',language: 'id-ID',profileVisibility: 'HIDDEN',directoryVisibility: 'HIDDEN',allowAnonymousPosting: true };

export function Onboarding() {
  const [server,setServer] = useState<OnboardingState | null>(null);
  const [step,setStep] = useState(0),[busy,setBusy] = useState(false),[error,setError] = useState('');
  const [adult,setAdult] = useState<boolean | null>(null),[accepted,setAccepted] = useState(false);
  const [location,setLocation] = useState<Location>({ source: 'SKIPPED',country: null,city: null,permission: 'NOT_REQUESTED' });
  const [needs,setNeeds] = useState<Need[]>([]),[goals,setGoals] = useState<Goal[]>([]),[format,setFormat] = useState<Format>('NO_PREFERENCE');
  const [privacy,setPrivacy] = useState<Privacy>(emptyPrivacy),[editing,setEditing] = useState(false);
  const pending = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await call<OnboardingState>('/users/me/onboarding');
      setServer(data);setAdult(data.ageConfirmed ? true : null);
      setAccepted(Boolean(data.policy && data.boundariesVersion === data.policy.version && data.boundariesLocale === data.policy.locale));
      if (data.location) setLocation({ source: data.location.source,country: data.location.country,city: data.location.city,permission: data.location.permission });
      setNeeds((data.preferences?.needs ?? []) as Need[]);setGoals((data.preferences?.goals ?? []) as Goal[]);setFormat(data.preferences?.communityType ?? 'NO_PREFERENCE');
      if (data.privacy) setPrivacy({ ...data.privacy,language: 'id-ID' });
      setStep(data.completedAt ? LAST : resumeStep(data));
    } catch (e) { setError(codeOf(e)); }
  },[]);
  useEffect(() => { void load(); },[load]);
  useEffect(() => { window.scrollTo({ top: 0 }); },[step]);

  async function save(path: string,body: unknown,next: number,method: 'PATCH' | 'POST' = 'PATCH') {
    if (pending.current) return;
    pending.current = true;setBusy(true);setError('');
    try {
      setServer(await call<OnboardingState>(path,{ method,body }));
      setStep(editing ? 9 : next);setEditing(false);
    } catch (e) { setError(codeOf(e)); }
    finally { pending.current = false;setBusy(false); }
  }
  const edit = (target: number) => { setEditing(true);setStep(target);setError(''); };
  const back = () => { setError('');if (editing) { setEditing(false);setStep(9); } else setStep(n => Math.max(0,n - 1)); };

  if (!server) return error ? <div className="m-empty"><h1>Belum bisa memuat.</h1><p>{errorText(error)}</p><button className="m-button" onClick={() => { setError('');void load(); }}>Coba lagi</button></div> : <p className="m-loading" role="status">Memuat…</p>;

  const policy = server.policy;
  const steps: Record<number,() => React.ReactNode> = {
    0: () => <Frame title="Hai, kenalan dulu yuk." lead="Beberapa pertanyaan singkat supaya Sandar bisa menunjukkan ruang yang cocok. Kamu yang pegang kendali atas apa yang dibagikan.">
      <ul className="m-list"><li>Sekitar 3 menit.</li><li>Kami nggak akan tanya diagnosis.</li><li>Pilihanmu tersimpan setiap kali lanjut.</li></ul>
      <Next onClick={() => void save('/users/me/onboarding/progress',{ step: 1 },1)} busy={busy}>Mulai</Next>
    </Frame>,
    1: () => <Frame title="Kamu sudah 18 tahun?" lead="Sandar khusus untuk orang dewasa.">
      <div className="m-choices" role="radiogroup" aria-label="Usia">
        <Choice on={adult === true} onClick={() => setAdult(true)} radio>Ya, aku 18 tahun atau lebih</Choice>
        <Choice on={adult === false} onClick={() => setAdult(false)} radio>Belum</Choice>
      </div>
      {adult === false && <div className="m-callout">Maaf, Sandar belum bisa dipakai di bawah 18 tahun. Kalau kamu butuh bantuan sekarang, hubungi <strong>119 ext. 8</strong> atau kunjungi Healing119.id.</div>}
      <Next onClick={() => void save('/users/me/onboarding/age',{ confirmed: true },2)} busy={busy} disabled={adult !== true}>Lanjut</Next>
    </Frame>,
    2: () => <Frame title="Sandar itu apa, dan bukan apa." lead="Biar jelas dari awal.">
      <dl className="m-pairs">
        <dt>Sandar adalah</dt><dd>Tempat dukungan sebaya: orang dewasa yang saling dengar dan berbagi pengalaman, dijaga moderator terlatih.</dd>
        <dt>Sandar bukan</dt><dd>Terapi, layanan medis, atau layanan darurat. Nggak ada yang di sini akan mendiagnosis kamu.</dd>
      </dl>
      <div className="m-callout"><strong>Kalau sedang darurat:</strong> {helpLines.map(l => `${l.n} (${l.l})`).join(', ')}.</div>
      <Next onClick={() => void save('/users/me/onboarding/progress',{ step: 3 },3)} busy={busy}>Aku mengerti</Next>
    </Frame>,
    3: () => <Frame title="Aturan dasar di setiap ruang" lead="Ini yang bikin Sandar tetap aman buat semua orang.">
      <ol className="m-numbered">{guidelines.map(g => <li key={g}>{g}</li>)}</ol>
      {policy ? <label className="m-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/>Aku sudah baca dan setuju dengan Pedoman Komunitas.</label>
        : <div className="m-callout">Pedoman belum tersedia, jadi langkah ini belum bisa diselesaikan. <button className="m-text" onClick={() => void load()}>Muat ulang</button></div>}
      <Next onClick={() => policy && void save('/users/me/onboarding/boundaries',{ accepted: true,locale: policy.locale,policyVersion: policy.version },4)} busy={busy} disabled={!policy || !accepted}>Setuju dan lanjut</Next>
    </Frame>,
    4: () => <LocationStep value={location} onChange={setLocation} busy={busy} onSave={body => void save('/users/me/location',body,5)}/>,
    5: () => <Frame title="Topik apa yang ingin kamu ikuti?" lead="Pilih yang terasa dekat. Ini bukan diagnosis, dan boleh dilewati.">
      <div className="m-chips">{supportInterests.map(v => <Choice key={v} on={needs.includes(v)} onClick={() => setNeeds(n => selectInterest(n,v as Need))}>{labels[v]}</Choice>)}</div>
      <Next onClick={() => void save('/users/me/interests',{ needs },6)} busy={busy}>{needs.length ? `Lanjut (${needs.length} dipilih)` : 'Lewati'}</Next>
    </Frame>,
    6: () => <Frame title="Kamu ingin ikut serta dengan cara apa?" lead="Boleh lebih dari satu, dan bisa diubah nanti.">
      <div className="m-chips">{participationPreferences.map(v => <Choice key={v} on={goals.includes(v)} onClick={() => setGoals(g => g.includes(v) ? g.filter(x => x !== v) : [...g,v])}>{labels[v]}</Choice>)}</div>
      <Next onClick={() => void save('/users/me/participation',{ goals },7)} busy={busy}>{goals.length ? 'Lanjut' : 'Lewati'}</Next>
    </Frame>,
    7: () => <Frame title="Lebih suka komunitas yang seperti apa?" lead="Untuk sekarang semua ruang Sandar online. Ini membantu kami saat komunitas lain bergabung.">
      <div className="m-choices" role="radiogroup" aria-label="Format komunitas">{formats.map(v => <Choice key={v} on={format === v} onClick={() => setFormat(v)} radio>{labels[v]}</Choice>)}</div>
      <Next onClick={() => void save('/users/me/community-format',{ communityType: format },8)} busy={busy}>Lanjut</Next>
    </Frame>,
    8: () => <Frame title="Privasimu, pilihanmu." lead="Nama tampilan boleh nama samaran.">
      <label className="m-field">Nama tampilan<input value={privacy.displayName} maxLength={80} autoComplete="nickname" onChange={e => setPrivacy(p => ({ ...p,displayName: e.target.value }))}/></label>
      <Toggle on={privacy.profileVisibility === 'MEMBERS'} onChange={on => setPrivacy(p => ({ ...p,profileVisibility: on ? 'MEMBERS' : 'HIDDEN' }))}>Profilku bisa dilihat anggota lain</Toggle>
      <Toggle on={privacy.directoryVisibility === 'DISPLAY_NAME'} onChange={on => setPrivacy(p => ({ ...p,directoryVisibility: on ? 'DISPLAY_NAME' : 'HIDDEN' }))}>Tampilkan namaku di daftar anggota</Toggle>
      <Toggle on={privacy.allowAnonymousPosting} onChange={on => setPrivacy(p => ({ ...p,allowAnonymousPosting: on }))}>Izinkan aku posting tanpa nama (saat posting dibuka)</Toggle>
      <Next onClick={() => void save('/users/me/privacy',{ ...privacy,displayName: privacy.displayName.trim() },9)} busy={busy} disabled={!privacy.displayName.trim()}>Lanjut</Next>
    </Frame>,
    9: () => <Frame title="Cek lagi pilihanmu" lead="Semua masih bisa diubah sebelum selesai.">
      <dl className="m-review">
        <Row label="Lokasi" value={server.location?.source === 'SKIPPED' || !server.location ? 'Dilewati' : `${server.location.city}, ${server.location.countryName ?? server.location.country}`} onEdit={() => edit(4)}/>
        <Row label="Topik" value={needs.map(v => labels[v]).join(', ') || 'Belum dipilih'} onEdit={() => edit(5)}/>
        <Row label="Cara ikut serta" value={goals.map(v => labels[v]).join(', ') || 'Belum dipilih'} onEdit={() => edit(6)}/>
        <Row label="Format" value={labels[format] ?? format} onEdit={() => edit(7)}/>
        <Row label="Privasi" value={`${privacy.displayName} · ${privacy.profileVisibility === 'MEMBERS' ? 'profil terlihat' : 'profil tersembunyi'}`} onEdit={() => edit(8)}/>
      </dl>
      <Next onClick={() => void save('/users/me/onboarding/complete',{},LAST,'POST')} busy={busy}>Selesai</Next>
    </Frame>,
    10: () => <Frame title="Semuanya siap." lead="Pelan-pelan aja. Mulai dengan membaca, dan kasih reaksi kalau ada yang terasa dekat.">
      <div className="m-callout">Posting dan komentar belum dibuka. Kami tunggu tim moderasi lengkap dulu, dan akan kabari lewat email.</div>
      <a className="m-button" href="/home">Ke Beranda</a>
    </Frame>
  };

  return <div className="m-onboarding">
    {step < LAST && <div className="m-progress">
      {step > 0 && <button className="m-text" onClick={back} disabled={busy}>← Kembali</button>}
      <span>Langkah {step + 1} dari {LAST}</span>
      <div className="m-track" role="progressbar" aria-valuemin={1} aria-valuemax={LAST} aria-valuenow={step + 1}><div style={{ width: `${(step + 1) / LAST * 100}%` }}/></div>
    </div>}
    {error && <div className="m-error" role="alert">{errorText(error)}</div>}
    {steps[step]!()}
  </div>;
}

function Frame({ title,lead,children }: { title: string; lead: string; children: React.ReactNode }) {
  return <section className="m-step"><h1>{title}</h1><p className="m-lead">{lead}</p>{children}</section>;
}
function Next({ onClick,busy,disabled,children }: { onClick: () => void; busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  return <button className="m-button m-next" onClick={onClick} disabled={busy || disabled}>{busy ? 'Menyimpan…' : children}</button>;
}
function Choice({ on,onClick,radio,children }: { on: boolean; onClick: () => void; radio?: boolean; children: React.ReactNode }) {
  return <button type="button" className={on ? 'm-choice on' : 'm-choice'} onClick={onClick} role={radio ? 'radio' : undefined} aria-checked={radio ? on : undefined} aria-pressed={radio ? undefined : on}>{children}</button>;
}
function Toggle({ on,onChange,children }: { on: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return <label className="m-toggle"><span>{children}</span><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)}/></label>;
}
function Row({ label,value,onEdit }: { label: string; value: string; onEdit: () => void }) {
  return <div><dt>{label}</dt><dd>{value}</dd><button className="m-text" onClick={onEdit} aria-label={`Ubah ${label}`}>Ubah</button></div>;
}

function LocationStep({ value,onChange,busy,onSave }: { value: Location; onChange: (v: Location) => void; busy: boolean; onSave: (body: Location) => void }) {
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
  return <Frame title="Kamu tinggal di kota mana?" lead="Hanya kota, bukan alamat. Ini membantu kami menunjukkan komunitas di dekatmu nanti. Boleh dilewati.">
    <label className="m-field">Negara<select value={country} onChange={e => { onChange({ source: 'SKIPPED',country: e.target.value,city: null,permission: 'NOT_REQUESTED' });setQuery(''); }}>
      {countries.length ? countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>) : <option value="ID">Indonesia</option>}
    </select></label>
    {manual ? <label className="m-field">Kota<input value={city ?? ''} maxLength={100} onChange={e => onChange({ source: 'MANUAL',country,city: e.target.value,permission: 'NOT_REQUESTED' })}/></label> : <>
      <label className="m-field">Cari kota<input value={query} maxLength={100} placeholder="mis. Bandung" onChange={e => setQuery(e.target.value)}/></label>
      <div className="m-chips">{cities.map(c => <Choice key={c} on={city === c} onClick={() => onChange({ source: 'DIRECTORY',country,city: c,permission: 'NOT_REQUESTED' })} radio>{c}</Choice>)}</div>
      {(failed || (query && !cities.length)) && <p className="m-small">Kotamu nggak ada di daftar? Tulis sendiri saja.</p>}
    </>}
    <button className="m-text" onClick={() => { setManual(m => !m);onChange({ source: 'SKIPPED',country,city: null,permission: 'NOT_REQUESTED' }); }}>{manual ? 'Pilih dari daftar' : 'Tulis kota sendiri'}</button>
    <Next onClick={() => onSave(city?.trim() ? { ...value,country,city: city.trim() } : { source: 'SKIPPED',country: null,city: null,permission: 'NOT_REQUESTED' })} busy={busy}>{city?.trim() ? 'Lanjut' : 'Lewati'}</Next>
  </Frame>;
}
