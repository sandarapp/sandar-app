import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, AppState, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useNetworkState } from 'expo-network';
import { NativeAuthClient, Transport } from '../../packages/auth-client/src/client';
import { useAuthFlow } from '../../packages/auth-client/src/use-auth-flow';
import { parseAuthLink, type AuthScreen } from '../../packages/auth-client/src/links';
import { tokenStore } from './src/secure-store';

const apiBase = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/v1';
const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000';
const titles: Record<AuthScreen,string> = { login: 'Selamat datang kembali.',register: 'Buat akun Sandar.', 'check-email': 'Periksa email Anda.', 'verify-email': 'Konfirmasikan email.', 'forgot-password': 'Pulihkan akses Anda.', 'reset-password': 'Kata sandi baru.',account: 'Anda sudah masuk.' };
export default function App() { return <SafeAreaProvider><AuthApp/></SafeAreaProvider>; }
export function AuthApp() {
  const network = useNetworkState();const connected = useRef(true);connected.current = network.isConnected !== false;
  const client = useMemo(() => new NativeAuthClient(new Transport(apiBase,{ online: () => connected.current }),tokenStore),[]);
  const confirmDiscard = useCallback(() => new Promise<boolean>(resolve => Alert.alert('Buang isian?','Kata sandi yang belum dikirim tidak akan disimpan.',[{ text:'Tetap mengisi',style:'cancel',onPress:()=>resolve(false) },{ text:'Buang',style:'destructive',onPress:()=>resolve(true) }],{cancelable:false})),[]);
  const flow = useAuthFlow(client,'login',confirmDiscard);
  const flowRef = useRef(flow);flowRef.current = flow;
  useEffect(() => {
    void flowRef.current.restoreSession();
    const handleLink = async (raw: string|null) => {
      if (!raw) return;
      const link = parseAuthLink(raw,webOrigin);
      if (flowRef.current.dirty && !(await confirmDiscard())) return;
      if (link) flowRef.current.receiveLink(link.screen,link.token);
      else if (raw.startsWith('sandar:') || raw.startsWith(webOrigin)) flowRef.current.receiveLink(raw.includes('reset-password') ? 'reset-password' : 'verify-email',null);
    };
    void Linking.getInitialURL().then(handleLink);
    const links = Linking.addEventListener('url',event => { void handleLink(event.url); });
    const state = AppState.addEventListener('change',next => { if (next === 'active' && flowRef.current.screen === 'account' && !flowRef.current.busy) void flowRef.current.refreshSession(); });
    const back = BackHandler.addEventListener('hardwareBackPress',() => {
      if (flowRef.current.screen !== 'login') { void flowRef.current.navigate('login');return true; }
      if (flowRef.current.dirty) { void confirmDiscard().then(discard => { if (discard) BackHandler.exitApp(); });return true; }
      return false;
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active' && flowRef.current.screen === 'account' && !flowRef.current.busy) void flowRef.current.refreshSession(); },60000);
    return () => { links.remove();state.remove();back.remove();clearInterval(timer); };
  },[confirmDiscard]);
  const go = (screen: AuthScreen) => { void flow.navigate(screen); };
  const emailVisible = ['login','register','forgot-password','check-email'].includes(flow.screen);
  const passwordVisible = ['login','register','reset-password'].includes(flow.screen);
  const newPassword = flow.screen !== 'login';
  const success = Boolean(flow.notice) && ['verify-email','reset-password'].includes(flow.screen) && !flow.token;
  const button = (label: string,onPress:()=>void,disabled=false,secondary=false) => <Pressable accessibilityRole="button" accessibilityState={{disabled}} onPress={onPress} disabled={disabled} style={[styles.button,secondary&&styles.secondary,disabled&&styles.disabled]}><Text style={[styles.buttonText,secondary&&styles.secondaryText]}>{label}</Text></Pressable>;
  const nav = (label: string,screen: AuthScreen) => <Pressable accessibilityRole="button" onPress={()=>go(screen)} disabled={flow.busy} style={styles.nav}><Text style={styles.navText}>{label}</Text></Pressable>;
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Text style={styles.logo}>◒ Sandar</Text><Text style={styles.tag}>PROTOTIPE · 18+</Text></View>
    <Text style={styles.brandLine}>Real People. Brighter Days.</Text>
    <View style={styles.hero}><Text style={styles.eyebrow}>RUANG UNTUK MENJADI DIRIMU</Text><Text accessibilityRole="header" style={styles.title}>{titles[flow.screen]}</Text><Text style={styles.description}>{flow.screen==='account' ? 'Status akun selalu diperiksa langsung oleh server.' : 'Percakapan kecil. Hari esok yang lebih cerah.'}</Text></View>
    {!connected.current && <Text accessibilityLiveRegion="polite" style={styles.error}>Anda sedang offline. Sambungkan internet untuk melanjutkan.</Text>}
    {flow.error && <Text accessibilityRole="alert" style={styles.error}>{flow.error.status===401 && flow.screen==='account' ? 'Sesi berakhir. ' : ''}{flow.error.message}{flow.cooldown>0 ? ` Coba lagi dalam ${flow.cooldown} detik.` : ''}</Text>}
    {flow.notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{flow.notice}</Text>}
    {flow.error?.code==='EMAIL_VERIFICATION_REQUIRED' && nav('Kirim ulang email verifikasi','check-email')}
    {flow.busy && <View accessibilityLabel="Memproses" style={styles.loading}><ActivityIndicator color="#b65440"/><Text>Memproses…</Text></View>}
    {flow.screen==='account' ? <>
      {flow.user && <View style={styles.summary}><Text style={styles.label}>{flow.user.email}</Text><Text style={styles.description}>Jenis akun: {flow.user.accountType==='COMMUNITY' ? 'Komunitas' : 'Member'}</Text><Text style={styles.description}>Email terverifikasi · {flow.user.status}</Text><Text style={styles.description}>Autentikasi selesai. Onboarding belum tersedia pada Epic 1. Verifikasi email tidak memberi akses komunitas atau persetujuan organisasi.</Text></View>}
      {!flow.user && button('Periksa sesi lagi',()=>void flow.refreshSession(),flow.busy||flow.cooldown>0)}
      {button('Keluar',()=>void flow.logout(),flow.busy,true)}
      {nav('Masuk kembali','login')}
    </> : <>
      {flow.screen==='register' && <View style={styles.types}>{(['member','community'] as const).map(type=><Pressable key={type} accessibilityRole="radio" accessibilityState={{checked:flow.accountType===type}} onPress={()=>flow.setAccountType(type)} disabled={flow.busy} style={[styles.type,flow.accountType===type&&styles.typeActive]}><Text style={styles.label}>{type==='member' ? 'Member' : 'Komunitas'}</Text><Text style={styles.small}>{type==='member' ? 'Ruang untuk berbagi' : 'Akun organisasi'}</Text></Pressable>)}</View>}
      {emailVisible && <View style={styles.field}><Text style={styles.label}>Alamat email</Text><TextInput accessibilityLabel="Alamat email" style={styles.input} value={flow.email} onChangeText={flow.setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!flow.busy} placeholder="nama@contoh.com"/></View>}
      {passwordVisible && !success && <View style={styles.field}><Text style={styles.label}>{newPassword?'Kata sandi baru':'Kata sandi'}</Text><TextInput accessibilityLabel={newPassword?'Kata sandi baru':'Kata sandi'} style={styles.input} value={flow.password} onChangeText={flow.setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={newPassword?'new-password':'current-password'} maxLength={128} editable={!flow.busy}/>{newPassword&&<Text style={styles.small}>12–128 karakter. Gunakan kata sandi yang unik.</Text>}</View>}
      {passwordVisible && newPassword && !success && <View style={styles.field}><Text style={styles.label}>Konfirmasi kata sandi</Text><TextInput accessibilityLabel="Konfirmasi kata sandi" style={styles.input} value={flow.confirmation} onChangeText={flow.setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" maxLength={128} editable={!flow.busy}/>{flow.confirmation&&flow.password!==flow.confirmation ? <Text style={styles.fieldError}>Kata sandi belum sama.</Text> : null}</View>}
      {flow.screen==='register' && <View>{flow.policyLoading ? <Text>Memuat kebijakan…</Text> : flow.policies.length!==2 ? button('Muat ulang kebijakan',()=>void flow.loadPolicies(),false,true) : <>
        <View style={styles.consent}><Switch accessibilityLabel="Terima Ketentuan Penggunaan" value={flow.terms} onValueChange={flow.setTerms} disabled={flow.busy}/><Pressable onPress={()=>void Linking.openURL(`${webOrigin}/legal/terms`)}><Text style={styles.navText}>Ketentuan Penggunaan ↗</Text></Pressable></View>
        <View style={styles.consent}><Switch accessibilityLabel="Baca Pemberitahuan Privasi" value={flow.privacy} onValueChange={flow.setPrivacy} disabled={flow.busy}/><Pressable onPress={()=>void Linking.openURL(`${webOrigin}/legal/privacy`)}><Text style={styles.navText}>Pemberitahuan Privasi ↗</Text></Pressable></View><Text style={styles.small}>Kebijakan pengembangan. Jangan gunakan data produksi.</Text>
      </>}</View>}
      {flow.screen==='login' && nav('Lupa kata sandi?','forgot-password')}
      {flow.screen==='verify-email' && !success && <Text style={styles.description}>Tautan hanya digunakan ketika Anda memilih verifikasi.</Text>}
      {!success && button(({login:'Masuk',register:'Buat akun','check-email':'Kirim ulang email','verify-email':'Verifikasi email','forgot-password':'Kirim tautan pemulihan','reset-password':'Simpan kata sandi',account:''})[flow.screen],()=>void flow.submit(),!flow.canSubmit||!connected.current)}
      {flow.screen==='login' ? nav('Belum punya akun? Daftar sekarang','register') : nav('← Kembali ke masuk','login')}
      {flow.screen==='verify-email' && !success && nav('Minta tautan verifikasi baru','check-email')}
      {flow.screen==='reset-password' && !success && nav('Minta tautan pemulihan baru','forgot-password')}
    </>}
    <View style={styles.footer}><Text style={styles.small}>Dukungan sebaya untuk orang dewasa. Bukan pengganti layanan profesional atau darurat.</Text><Text style={styles.small}>Autentikasi Epic 1 · tanpa onboarding</Text></View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#fffaf5'},page:{padding:26,paddingBottom:42,flexGrow:1,maxWidth:560,width:'100%',alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},logo:{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:36,color:'#512b26'},tag:{fontSize:9,color:'#806e64'},brandLine:{fontSize:11,color:'#a55740',marginTop:3},hero:{marginTop:48,marginBottom:24},eyebrow:{fontSize:10,letterSpacing:1.3,color:'#a55740',marginBottom:14},title:{fontSize:33,fontFamily:Platform.OS==='ios'?'Georgia':'serif',color:'#512b26',lineHeight:39,marginBottom:14},description:{fontSize:14,color:'#806e64',lineHeight:23,marginBottom:12},field:{marginBottom:18},label:{fontSize:13,color:'#512b26',fontWeight:'600',marginBottom:8},input:{borderWidth:1,borderColor:'#d9c9be',backgroundColor:'#fffdf9',borderRadius:8,minHeight:50,paddingHorizontal:14,color:'#512b26',fontSize:15},small:{fontSize:11,color:'#806e64',lineHeight:18,marginTop:6},fieldError:{fontSize:12,color:'#993b2a',marginTop:6},button:{backgroundColor:'#b65440',minHeight:49,borderRadius:8,alignItems:'center',justifyContent:'center',marginTop:10,padding:14},buttonText:{color:'#fff',fontWeight:'600',fontSize:14},secondary:{backgroundColor:'transparent',borderWidth:1,borderColor:'#b65440'},secondaryText:{color:'#a24a38'},disabled:{opacity:.5},nav:{alignItems:'center',paddingVertical:15},navText:{color:'#a24a38',fontSize:12,textDecorationLine:'underline'},error:{backgroundColor:'#fce9e3',color:'#89382b',borderRadius:8,padding:14,fontSize:13,lineHeight:21,marginBottom:16},notice:{backgroundColor:'#eef4e9',color:'#3c6044',borderRadius:8,padding:14,fontSize:13,lineHeight:21,marginBottom:16},types:{flexDirection:'row',gap:12,marginBottom:24},type:{flex:1,padding:14,borderWidth:1,borderColor:'#dfcfc3',borderRadius:8},typeActive:{backgroundColor:'#fae9df',borderColor:'#b65440'},consent:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:7},footer:{borderTopWidth:1,borderTopColor:'#e8dbd2',marginTop:32,paddingTop:20},summary:{padding:20,borderWidth:1,borderColor:'#e8dbd2',borderRadius:12,marginBottom:20},loading:{flexDirection:'row',gap:10,alignItems:'center',marginBottom:18}
});
