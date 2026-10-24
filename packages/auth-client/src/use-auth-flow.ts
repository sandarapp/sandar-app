import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientError, type AuthClient, type Policy, type PublicUser } from './client.js';
import type { AuthScreen } from './links.js';
export function useAuthFlow(client: AuthClient, initialScreen: AuthScreen, confirmDiscard: () => Promise<boolean>, locale = 'id-ID') {
  const [screen,setScreen] = useState<AuthScreen>(initialScreen);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirmation,setConfirmation] = useState('');
  const [accountType,setAccountType] = useState<'member'|'community'>('member');
  const [terms,setTerms] = useState(false),[privacy,setPrivacy] = useState(false);
  const [policies,setPolicies] = useState<Policy[]>([]);
  const [policyLoading,setPolicyLoading] = useState(false);
  const [user,setUser] = useState<PublicUser|null>(null);
  const [error,setError] = useState<ClientError|null>(null);
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [cooldown,setCooldown] = useState(0);
  const [token,setToken] = useState<string|null>(null);
  const gate = useRef(false), generation = useRef(0),policyGeneration=useRef(0);
  const dirty = password.length > 0 || confirmation.length > 0 || (screen === 'register' && (email.length > 0 || terms || privacy));
  const navigate = useCallback(async (next: AuthScreen, force = false) => {
    if (gate.current) return false;
    if (!force && dirty && !(await confirmDiscard())) return false;
    generation.current++;
    setScreen(next);setPassword('');setConfirmation('');setError(null);setNotice('');setToken(null);setUser(null);
    setTerms(false);setPrivacy(false);
    return true;
  },[dirty,confirmDiscard]);
  const receiveLink = useCallback((target: 'verify-email'|'reset-password', value: string|null) => {
    generation.current++;
    setScreen(target);setToken(value);setPassword('');setConfirmation('');setUser(null);setNotice('');
    setError(value ? null : new ClientError('TOKEN_INVALID_OR_EXPIRED','Tautan tidak valid atau tidak lengkap. Minta tautan baru.'));
  },[]);
  const loadPolicies = useCallback(async () => {
    const mark=++policyGeneration.current;setPolicyLoading(true);setPolicies([]);
    try {
      const list = (await client.policies()).filter(p => p.locale === locale && ['TERMS','PRIVACY_NOTICE'].includes(p.type));
      if (list.length !== 2 || new Set(list.map(p => p.type)).size !== 2) throw new ClientError('POLICY_UNAVAILABLE','Kebijakan belum tersedia. Pendaftaran belum dapat dilanjutkan.');
      if(mark===policyGeneration.current)setPolicies(list);
    } catch (failure) { setError(failure instanceof ClientError ? failure : new ClientError('SERVER_ERROR','Kebijakan tidak dapat dimuat.')); }
    finally { if(mark===policyGeneration.current)setPolicyLoading(false); }
  },[client,locale]);
  useEffect(() => { if (screen === 'register') void loadPolicies(); },[screen,loadPolicies]);
  useEffect(() => { if (cooldown <= 0) return; const timer = setTimeout(() => setCooldown(n => n-1),1000);return () => clearTimeout(timer); },[cooldown]);
  const run = useCallback(async (work: () => Promise<void>) => {
    if (gate.current || cooldown > 0) return;
    gate.current = true;setBusy(true);setError(null);setNotice('');
    try { await work(); }
    catch (failure) {
      const mapped = failure instanceof ClientError ? failure : new ClientError('SERVER_ERROR','Terjadi kesalahan. Coba lagi.');
      setError(mapped);
      if (mapped.retryAfter) setCooldown(mapped.retryAfter);
      if (mapped.code === 'POLICY_VERSION_CHANGED') { setTerms(false);setPrivacy(false);await loadPolicies(); }
    } finally { gate.current = false;setBusy(false); }
  },[cooldown,loadPolicies]);
  const refreshSession = useCallback(async () => {
    const current = generation.current;
    setUser(null); // Never keep an authorization-sensitive screen visible while revalidating.
    await run(async () => {
      const result = await client.session();
      if (generation.current === current) setUser(result);
    });
  },[client,run]);
  const restoreSession = useCallback(() => run(async () => {
    const current = generation.current;
    try {
      const result = await client.session();
      if (generation.current === current) { setUser(result);setScreen('account'); }
    } catch (failure) {
      if (failure instanceof ClientError && failure.status === 401) return;
      throw failure;
    }
  }),[client,run]);
  useEffect(() => { if (screen === 'account') void refreshSession(); },[screen,refreshSession]);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254;
  const passwordValid = password.length >= 12 && password.length <= 128;
  const canSubmit = !busy && !cooldown && (
    screen === 'login' ? emailValid && password.length > 0 && password.length <= 128 :
    screen === 'register' ? emailValid && passwordValid && password === confirmation && terms && privacy && policies.length === 2 && !policyLoading :
    screen === 'forgot-password' || screen === 'check-email' ? emailValid :
    screen === 'reset-password' ? Boolean(token) && passwordValid && password === confirmation :
    screen === 'verify-email' ? Boolean(token) : false
  );
  const submit = () => run(async () => {
    const current=generation.current;
    if (!canSubmit) throw new ClientError('VALIDATION_ERROR','Periksa isian yang wajib diisi.');
    if (screen === 'login') {
      const result = await client.login(email.trim(),password);if(current!==generation.current)return;
      setPassword('');setConfirmation('');setUser(result);setScreen('account');
    } else if (screen === 'register') {
      await client.register(accountType,{ email: email.trim(),password,consents: policies.map(p => ({ type: p.type,policyVersion: p.version,locale: p.locale,accepted: true })) });if(current!==generation.current)return;
      setPassword('');setConfirmation('');setScreen('check-email');
      setNotice('Jika permintaan memenuhi syarat, tautan verifikasi akan dikirim ke email Anda.');
    } else if (screen === 'forgot-password') {
      await client.forgot(email.trim());if(current!==generation.current)return;setNotice('Jika alamat ini memenuhi syarat, kami akan mengirim tautan pengaturan ulang.');
    } else if (screen === 'check-email') {
      await client.resend(email.trim());if(current!==generation.current)return;setNotice('Jika permintaan memenuhi syarat, email verifikasi akan dikirim.');
    } else if (screen === 'verify-email') {
      await client.verify(token!);if(current!==generation.current)return;setToken(null);setNotice('Email terverifikasi. Silakan masuk untuk melanjutkan.');
    } else if (screen === 'reset-password') {
      await client.reset(token!,password);if(current!==generation.current)return;setToken(null);setPassword('');setConfirmation('');setUser(null);
      setNotice('Kata sandi diperbarui. Semua sesi sebelumnya telah diakhiri. Silakan masuk kembali.');
    }
  });
  const logout = () => run(async () => {
    generation.current++;setUser(null);
    try { await client.logout();setScreen('login');setNotice('Anda telah keluar.'); }
    catch (failure) {
      if (failure instanceof ClientError && ['LOGOUT_PENDING','LOGOUT_LOCAL_ONLY'].includes(failure.code)) setScreen('login');
      throw failure;
    }
  });
  return { screen,email,password,confirmation,accountType,terms,privacy,policies,policyLoading,user,error,notice,busy,cooldown,token,dirty,canSubmit,
    setEmail,setPassword,setConfirmation,setAccountType,setTerms,setPrivacy,navigate,receiveLink,loadPolicies,submit,logout,refreshSession,restoreSession };
}
