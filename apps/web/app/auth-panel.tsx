'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebAuthClient,Transport } from '../../../packages/auth-client/src/client';
import { useAuthFlow } from '../../../packages/auth-client/src/use-auth-flow';
import { parseAuthLink, type AuthScreen } from '../../../packages/auth-client/src/links';

const titles: Record<AuthScreen,string> = { login: 'Selamat datang kembali.',register: 'Mulai dari percakapan kecil.', 'check-email': 'Periksa email Anda.', 'verify-email': 'Konfirmasikan email Anda.', 'forgot-password': 'Mari pulihkan akses Anda.', 'reset-password': 'Buat kata sandi baru.',account: 'Anda sudah masuk.' };
const subtitles: Record<AuthScreen,string> = { login: 'Masuk ke akun Anda. Satu langkah menuju hari yang lebih baik.',register: 'Buat akun Sandar. Ruang untuk didengar, tanpa harus menjadi siapa-siapa.', 'check-email': 'Buka tautan verifikasi di email untuk mengonfirmasi alamat Anda.', 'verify-email': 'Tautan tidak digunakan sampai Anda memilih verifikasi.', 'forgot-password': 'Masukkan email akun Anda. Kami akan mengirim langkah berikutnya.', 'reset-password': 'Pilih kata sandi unik yang tidak digunakan di layanan lain.',account: 'Status di bawah diperiksa langsung oleh server.' };
export function AuthPanel({ initialScreen }: {initialScreen: AuthScreen}) {
  const client = useMemo(() => new WebAuthClient(new Transport('/api/v1',{ web: true,online: () => navigator.onLine })),[]);
  const confirmDiscard = useCallback(async () => window.confirm('Buang isian yang belum dikirim? Kata sandi tidak akan disimpan.'),[]);
  const flow = useAuthFlow(client,initialScreen,confirmDiscard);
  const flowRef = useRef(flow);flowRef.current = flow;
  const [online,setOnline] = useState(true),[showPassword,setShowPassword] = useState(false);
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);updateOnline();
    window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline);
    const applyLink = () => {
      const screen = window.location.pathname.slice(1);
      if (screen === 'verify-email' || screen === 'reset-password') {
        const link = parseAuthLink(window.location.href,window.location.origin);
        flowRef.current.receiveLink(screen,link?.token ?? null);
        window.history.replaceState(null,'',`/${screen}`); // Remove token/history before any API request.
      }
    };
    applyLink();
    const pop = async () => {
      const path = window.location.pathname.slice(1) as AuthScreen;
      const accepted = await flowRef.current.navigate(Object.hasOwn(titles,path) ? path : 'login');
      if (!accepted) window.history.pushState(null,'',`/${flowRef.current.screen}`);
      else applyLink();
    };
    const focus = () => { if (flowRef.current.screen === 'account' && !flowRef.current.busy) void flowRef.current.refreshSession(); };
    const unload = (event: BeforeUnloadEvent) => { if (flowRef.current.dirty) { event.preventDefault();event.returnValue = ''; } };
    window.addEventListener('popstate',pop);window.addEventListener('focus',focus);window.addEventListener('beforeunload',unload);
    const timer = window.setInterval(focus,60000);
    return () => { window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline);window.removeEventListener('popstate',pop);window.removeEventListener('focus',focus);window.removeEventListener('beforeunload',unload);clearInterval(timer); };
  },[]);
  useEffect(() => { if (window.location.pathname !== `/${flow.screen}`) window.history.pushState(null,'',`/${flow.screen}`); },[flow.screen]);
  const go = (screen: AuthScreen) => { void flow.navigate(screen); };
  const needsEmail = ['login','register','forgot-password','check-email'].includes(flow.screen);
  const needsPassword = ['login','register','reset-password'].includes(flow.screen);
  const newPassword = ['register','reset-password'].includes(flow.screen);
  const success = Boolean(flow.notice) && ['verify-email','reset-password'].includes(flow.screen) && !flow.token;
  return <main className="auth-layout">
    <aside className="brand-panel" aria-label="Tentang Sandar">
      <a className="brand" href="/login" onClick={event => { event.preventDefault();go('login'); }}><span className="sun-mark" aria-hidden="true">◒</span> Sandar<span>Real People. Brighter Days.</span></a>
      <div className="brand-story"><p className="eyebrow">RUANG UNTUK MENJADI DIRIMU</p><h1>Percakapan kecil.<br/>Hari esok yang<br/><em>lebih cerah.</em></h1><p>Tidak semua hal harus dijalani sendiri.<br/>Mulai dengan ruang yang mau mendengar.</p><div className="values"><span>◇ Saling menghargai</span><span>♡ Saling mendukung</span></div></div>
      <div className="landscape" aria-hidden="true"><span className="sun"/><span className="ridge ridge-back"/><span className="ridge ridge-front"/><span className="water"/></div>
      <p className="brand-footer">Orang nyata. Percakapan bermakna.</p>
    </aside>
    <section className="form-panel"><header className="topbar"><span>SELAMAT DATANG DI SANDAR</span><span className="dev-tag">Prototipe · 18+</span></header>
      <div className="auth-card">
        <div className="step-icon" aria-hidden="true">{flow.screen === 'account' || success ? '✓' : ['verify-email','check-email'].includes(flow.screen) ? '✉' : newPassword ? '◇' : '◒'}</div>
        <p className="eyebrow">{flow.screen === 'register' ? 'BUAT AKUN' : flow.screen === 'account' ? 'AKUN ANDA' : 'SATU LANGKAH LEBIH DEKAT'}</p>
        <h2>{success ? flow.screen === 'verify-email' ? 'Email terverifikasi.' : 'Kata sandi diperbarui.' : titles[flow.screen]}</h2><p className="intro">{subtitles[flow.screen]}</p>
        {!online && <div className="error" role="status">Anda sedang offline. Sambungkan internet untuk melanjutkan.</div>}
        {flow.error && <div className="error" role="alert" data-error-code={flow.error.code}><strong>{flow.error.status === 401 && flow.screen === 'account' ? 'Sesi berakhir. ' : ''}</strong>{flow.error.message}{flow.cooldown > 0 && <span> Coba lagi dalam {flow.cooldown} detik.</span>}</div>}
        {flow.notice && <div className="notice" role="status">{flow.notice}</div>}
        {flow.error?.code === 'EMAIL_VERIFICATION_REQUIRED' && <button className="text-button" onClick={() => go('check-email')}>Kirim ulang email verifikasi</button>}
        {flow.screen === 'account' ? <>
          {flow.busy && <p role="status">Memeriksa sesi…</p>}
          {flow.user && <div className="account-summary"><span className="account-avatar">✓</span><h3>{flow.user.email}</h3><dl><dt>Jenis akun</dt><dd>{flow.user.accountType === 'COMMUNITY' ? 'Komunitas' : 'Member'}</dd><dt>Status</dt><dd>{flow.user.status === 'ONBOARDING_INCOMPLETE' ? 'Onboarding belum dilakukan' : flow.user.status}</dd><dt>Email</dt><dd>Terverifikasi</dd></dl><p>Autentikasi selesai. Onboarding belum tersedia pada Epic 1. {flow.user.accountType === 'COMMUNITY' ? 'Verifikasi email tidak berarti komunitas Anda telah disetujui.' : 'Belum ada akses ke konten atau partisipasi komunitas.'}</p></div>}
          {!flow.user && !flow.busy && <button className="primary" onClick={() => void flow.refreshSession()} disabled={flow.cooldown > 0}>Periksa sesi lagi</button>}
          <button className="secondary" onClick={() => void flow.logout()} disabled={flow.busy}>Keluar</button>
          {flow.error?.status === 401 && <button className="text-button" onClick={() => go('login')}>Masuk kembali</button>}
        </> : <form noValidate onSubmit={event => { event.preventDefault();void flow.submit(); }}>
          {flow.screen === 'register' && <fieldset className="account-types"><legend>Daftar sebagai</legend>{(['member','community'] as const).map(type => <label key={type} className={flow.accountType === type ? 'chosen' : ''}><input type="radio" name="accountType" value={type} checked={flow.accountType === type} onChange={() => flow.setAccountType(type)} disabled={flow.busy}/><strong>{type === 'member' ? 'Member' : 'Komunitas'}</strong><span>{type === 'member' ? 'Temukan ruang untuk berbagi.' : 'Daftarkan organisasi Anda.'}</span></label>)}</fieldset>}
          {needsEmail && <label className="field">Alamat email<input name="email" type="email" autoComplete="email" value={flow.email} maxLength={254} placeholder="nama@contoh.com" onChange={e => flow.setEmail(e.target.value)} disabled={flow.busy} required/></label>}
          {needsPassword && !success && <><label className="field">{newPassword ? 'Kata sandi baru' : 'Kata sandi'}<span className="password-input"><input name="password" aria-label={newPassword ? 'Kata sandi baru' : 'Kata sandi'} type={showPassword ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} value={flow.password} maxLength={128} onChange={e => flow.setPassword(e.target.value)} disabled={flow.busy} required/><button type="button" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Sembunyikan' : 'Lihat'}</button></span></label>{newPassword && <p className="field-hint">12–128 karakter. Gunakan kata sandi yang unik.</p>}</>}
          {newPassword && !success && <label className="field">Konfirmasi kata sandi<input name="confirmation" aria-label="Konfirmasi kata sandi" type="password" autoComplete="new-password" value={flow.confirmation} maxLength={128} onChange={e => flow.setConfirmation(e.target.value)} disabled={flow.busy} required/>{flow.confirmation && flow.password !== flow.confirmation && <span className="field-error">Kata sandi belum sama.</span>}</label>}
          {flow.screen === 'register' && <div className="consents">{flow.policyLoading ? <p role="status">Memuat kebijakan…</p> : flow.policies.length !== 2 ? <button type="button" className="text-button" onClick={() => void flow.loadPolicies()}>Muat ulang kebijakan</button> : <><label><input type="checkbox" checked={flow.terms} onChange={e => flow.setTerms(e.target.checked)} disabled={flow.busy}/>Saya menerima <a href="/legal/terms" target="_blank" rel="noreferrer">Ketentuan Penggunaan</a>.</label><label><input type="checkbox" checked={flow.privacy} onChange={e => flow.setPrivacy(e.target.checked)} disabled={flow.busy}/>Saya telah membaca <a href="/legal/privacy" target="_blank" rel="noreferrer">Pemberitahuan Privasi</a>.</label></>}<p className="field-hint">Kebijakan pengembangan. Jangan gunakan data produksi.</p></div>}
          {flow.screen === 'login' && <button type="button" className="text-button forgot" onClick={() => go('forgot-password')}>Lupa kata sandi?</button>}
          {!success && <button className="primary" type="submit" disabled={!flow.canSubmit || !online}>{flow.busy ? 'Memproses…' : flow.cooldown > 0 ? `Coba lagi dalam ${flow.cooldown} dtk` : ({ login: 'Masuk',register: 'Buat akun','check-email': 'Kirim ulang email','verify-email': 'Verifikasi email','forgot-password': 'Kirim tautan pemulihan','reset-password': 'Simpan kata sandi',account: '' })[flow.screen]}</button>}
          {flow.token && <a className="text-button native-link" href={`sandar://${flow.screen}#token=${flow.token}`} rel="noreferrer">Buka di aplikasi Sandar</a>}
        </form>}
        {flow.screen !== 'account' && <nav className="auth-nav" aria-label="Navigasi akun">{flow.screen === 'login' ? <p>Belum punya akun? <button onClick={() => go('register')}>Daftar sekarang</button></p> : <button onClick={() => go('login')}>← Kembali ke masuk</button>}{flow.screen === 'verify-email' && !success && <button onClick={() => go('check-email')}>Minta tautan verifikasi baru</button>}{flow.screen === 'reset-password' && !success && <button onClick={() => go('forgot-password')}>Minta tautan pemulihan baru</button>}</nav>}
        <div className="safety-note"><span aria-hidden="true">◇</span><p>Ruang dukungan sebaya untuk orang dewasa.<br/>Bukan pengganti layanan profesional atau darurat.</p></div>
      </div><footer className="form-footer"><span>© Sandar · Prototipe pengembangan</span><a href="/legal/privacy">Privasi</a></footer>
    </section>
  </main>;
}
