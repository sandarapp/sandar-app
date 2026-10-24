import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Image,ScrollView,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import * as Location from 'expo-location';
import {resolveDestination,type IntendedDestination} from '../../../packages/auth-client/src/destination';
import {SpacesApp} from './spaces/SpacesApp';
import {ClientError,type NativeAuthClient} from '../../../packages/auth-client/src/client';
import {locationInput,privacyInput,supportInterests,participationPreferences,type OnboardingState,type onboardingEvents} from '../../../packages/contracts/src/onboarding';
import {MotionPreference,Tactile} from './foundation/visual';
import {coarseLocation,labels,resumeStep,selectInterest,stepTitles} from './onboarding/model';
import {onboardingCopy} from './onboarding/copy';
import welcomeImage from '../assets/fidelity-member-router.jpg';
import successImage from '../assets/fidelity-success.jpg';

type Props={client:NativeAuthClient;onLogout:()=>void;onSessionExpired?:()=>void;initialDestination?:Extract<IntendedDestination,{kind:'space'}>;onDestinationHandled?:()=>void};
type Event=typeof onboardingEvents[number];
const initial:OnboardingState={ageConfirmed:false,boundariesVersion:null,boundariesLocale:null,location:null,preferences:null,privacy:null,completedAt:null,policy:null};
const emptyPrivacy={displayName:'',language:'en' as 'en'|'id-ID',profileVisibility:'HIDDEN' as 'HIDDEN'|'MEMBERS',directoryVisibility:'HIDDEN' as 'HIDDEN'|'DISPLAY_NAME',allowAnonymousPosting:true};
export function MemberOnboarding(props:Props){return <MotionPreference><Onboarding {...props}/></MotionPreference>;}
function Onboarding({client,onLogout,onSessionExpired,initialDestination,onDestinationHandled}:Props){
 const [server,setServer]=useState(initial),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[expired,setExpired]=useState(false),[home,setHome]=useState(false);
 const [locale,setLocale]=useState<'en'|'id-ID'>('en'),[adult,setAdult]=useState<boolean|null>(null),[accepted,setAccepted]=useState(false);
 const [location,setLocation]=useState<NonNullable<OnboardingState['location']>>({source:'SKIPPED',country:null,city:null,permission:'NOT_REQUESTED'});
 const [needs,setNeeds]=useState<NonNullable<OnboardingState['preferences']>['needs']>([]),[goals,setGoals]=useState<NonNullable<OnboardingState['preferences']>['goals']>([]),[format,setFormat]=useState<NonNullable<OnboardingState['preferences']>['communityType']>('NO_PREFERENCE'),[privacy,setPrivacy]=useState(emptyPrivacy);
 const [editing,setEditing]=useState(false),[notice,setNotice]=useState(''),[countries,setCountries]=useState<{code:string;name:string}[]>([]),[countrySearch,setCountrySearch]=useState(''),[citySearch,setCitySearch]=useState(''),[cityResults,setCityResults]=useState<string[]>([]),[searching,setSearching]=useState(false),[directoryError,setDirectoryError]=useState(false),[manual,setManual]=useState(false);
 const policyKey=useRef(''),loadGeneration=useRef(0);
 const initialized=useRef(false),pending=useRef(false),alive=useRef(true),viewedStep=useRef<number|null>(null);
 const t=(text:string)=>locale==='en'?text:onboardingCopy[text]??text;
 const track=useCallback((event:Event,at?:number)=>{void client.memberRequest('/users/me/onboarding/analytics',{method:'POST',body:{event,...(at===undefined?{}:{step:at})}}).catch(()=>{});},[client]);
 const fail=(e:unknown)=>{if(e instanceof ClientError&&e.status===401){setExpired(true);return;}setError(e instanceof ClientError?e.code:'SAVE_FAILED');};
 const load=useCallback(async()=>{
  const generation=++loadGeneration.current;setLoading(true);setError('');
  try{
   let data=await client.memberRequest<OnboardingState>('/users/me/onboarding',{locale});
   // Select the resume step against the policy in the saved UI language.
   if(!initialized.current&&data.privacy&&data.privacy.language!==locale)data=await client.memberRequest<OnboardingState>('/users/me/onboarding',{locale:data.privacy.language});
   if(!alive.current||generation!==loadGeneration.current)return;setServer(data);
   if(data.completedAt){const destination=await resolveDestination(client,initialDestination);if(destination.kind!=='member-home')throw new ClientError('FORBIDDEN','Access unavailable',403);if(alive.current)setHome(true);return;}
   const first=!initialized.current;
   if(first){setAdult(data.ageConfirmed?true:null);setLocation(data.location??{source:'SKIPPED',country:null,city:null,permission:'NOT_REQUESTED'});setNeeds(data.preferences?.needs??[]);setGoals(data.preferences?.goals??[]);setFormat(data.preferences?.communityType??'NO_PREFERENCE');if(data.privacy){setPrivacy(data.privacy);setLocale(data.privacy.language);}setStep(resumeStep(data));initialized.current=true;track('member_onboarding_started');}
   const key=data.policy?data.policy.locale+':'+data.policy.version:'';
   if(first||key!==policyKey.current)setAccepted(Boolean(data.policy&&data.boundariesVersion===data.policy.version&&data.boundariesLocale===data.policy.locale));policyKey.current=key;
  }catch(e){if(alive.current)fail(e);}finally{if(alive.current)setLoading(false);}
 },[client,locale,initialDestination,track]);
 useEffect(()=>{alive.current=true;void load();const listener=AppState.addEventListener('change',s=>{if(s==='active'&&!pending.current)void load();});return()=>{alive.current=false;listener.remove();};},[load]);
 useEffect(()=>{if(initialized.current&&!loading&&!home&&viewedStep.current!==step){viewedStep.current=step;track('member_onboarding_step_viewed',step);if(step===9)track('onboarding_review_viewed',step);}},[step,loading,home,track]);
 const back=()=>{if(!pending.current){setError('');setNotice('');if(editing){setEditing(false);setStep(9);}else setStep(n=>Math.max(0,n-1));}};
 const backRef=useRef(back);backRef.current=back;
 useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(home)return false;backRef.current();return true;});return()=>sub.remove();},[home]);
 useEffect(()=>{if(step!==4)return;let active=true;void client.memberRequest<{code:string;name:string}[]>('/locations/countries').then(data=>{if(active)setCountries(data);}).catch(()=>{if(active)setDirectoryError(true);});return()=>{active=false;};},[step,client]);
 useEffect(()=>{if(step!==4||!location.country||manual)return;let active=true;setSearching(true);setDirectoryError(false);const timer=setTimeout(()=>{void client.memberRequest<string[]>('/locations/cities?country='+location.country+'&q='+encodeURIComponent(citySearch)).then(data=>{if(active)setCityResults(data);}).catch(()=>{if(active){setDirectoryError(true);setCityResults([]);}}).finally(()=>{if(active)setSearching(false);});},200);return()=>{active=false;clearTimeout(timer);};},[step,location.country,citySearch,manual,client]);
 const patch=async(path:string,body:unknown)=>{const data=await client.memberRequest<OnboardingState>(path,{method:'PATCH',body,locale});if(alive.current)setServer(data);return data;};
 const save=async(path:string,body:unknown,next:number)=>{
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  try{await patch(path,body);track('member_onboarding_step_completed',step);if(step===1)track('age_gate_completed',step);if(step===3)track('boundaries_acknowledged',step);if(step===8)track('privacy_preferences_completed',step);if(alive.current){setStep(editing?9:next);setEditing(false);setNotice('');}}
  catch(e){if(alive.current){fail(e);track('member_onboarding_failed',step);}}finally{pending.current=false;if(alive.current)setBusy(false);}
 };
 const locationBody=()=>({source:location.source,country:location.country,city:location.city,permission:location.permission});
 const locate=async()=>{
  if(pending.current)return;pending.current=true;setBusy(true);setNotice('');track('location_permission_requested',4);
  try{const result=await coarseLocation({permission:async()=>(await Location.requestForegroundPermissionsAsync()).granted,lookup:async()=>{const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Low});const place=(await Location.reverseGeocodeAsync(p.coords))[0];return place?.isoCountryCode&&place.city?{country:place.isoCountryCode,city:place.city}:null;}});if(!alive.current)return;
   track(result.permission==='GRANTED'?'location_permission_granted':'location_permission_denied',4);setLocation(v=>({...v,permission:result.permission}));
   if(result.place){setLocation({source:'DEVICE',country:result.place.country,city:result.place.city,permission:'GRANTED'});setNotice('Check your city before continuing. Coordinates are never sent to Sandar.');}
   else{setManual(true);setNotice(result.permission==='DENIED'?'Location permission denied. Enter your city manually or skip.':'Location lookup failed. Enter your city manually or skip.');}
  }catch{setManual(true);setNotice('Location lookup failed. Enter your city manually or skip.');}finally{pending.current=false;if(alive.current)setBusy(false);}
 };
 const finish=async()=>{
  if(pending.current)return;pending.current=true;setBusy(true);setError('');track('member_onboarding_submitted',9);
  try{
   if(!adult||!accepted)throw new ClientError('ONBOARDING_INCOMPLETE','Required gates',409);
   let data=await client.memberRequest<OnboardingState>('/users/me/onboarding',{locale});
   // A previous submit may have committed before the connection failed.
   if(!data.completedAt){
    await patch('/users/me/location',locationBody());await patch('/users/me/preferences',{needs,goals,communityType:format});await patch('/users/me/privacy',{...privacy,language:locale});
    data=await client.memberRequest<OnboardingState>('/users/me/onboarding/complete',{method:'POST',body:{},locale});
   }
   if(!data.completedAt)throw new ClientError('ONBOARDING_INCOMPLETE','Incomplete',409);
   const destination=await resolveDestination(client,initialDestination);if(destination.kind!=='member-home')throw new ClientError('ONBOARDING_INCOMPLETE','Destination not ready',409);
   if(alive.current){setServer(data);setStep(10);}
  }catch(e){if(alive.current){fail(e);track('member_onboarding_failed',9);}}finally{pending.current=false;if(alive.current)setBusy(false);}
 };
 const enterHome=async()=>{if(pending.current)return;pending.current=true;setBusy(true);try{const d=await resolveDestination(client,initialDestination);if(d.kind!=='member-home')throw new ClientError('FORBIDDEN','Not ready',403);setHome(true);}catch(e){fail(e);}finally{pending.current=false;setBusy(false);}};
 const button=(label:string,fn:()=>void,disabled=false,secondary=false)=><Tactile primary={!secondary} accessibilityRole="button" accessibilityLabel={t(label)} accessibilityState={{disabled:disabled||busy||loading}} disabled={disabled||busy||loading} onPress={fn} style={[s.button,secondary&&s.secondary,(disabled||busy||loading)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{t(label)}</Text></Tactile>;
 const choice=(label:string,selected:boolean,fn:()=>void,radio=false)=><Tactile key={label} accessibilityRole={radio?'radio':'checkbox'} accessibilityLabel={t(label)} accessibilityState={{checked:selected,disabled:busy}} disabled={busy} onPress={fn} style={[s.choice,selected&&s.selected]}><Ionicons name={selected?'checkmark-circle':radio?'ellipse-outline':'square-outline'} size={20} color="#b65031"/><Text style={s.choiceText}>{t(label)}</Text></Tactile>;
 const text=(value:string)=><Text style={s.body}>{t(value)}</Text>;
 const toggle=(label:string,value:boolean,onChange:(v:boolean)=>void)=><View style={s.row}><Text style={[s.body,s.flex]}>{t(label)}</Text><Switch accessibilityLabel={t(label)} value={value} disabled={busy} onValueChange={onChange}/></View>;
 const edit=(to:number)=>{setEditing(true);setStep(to);setError('');};
 const next=()=>{
  if(step===0)void save('/users/me/onboarding/progress',{step:1},1);
  if(step===1)void save('/users/me/onboarding/age',{confirmed:adult},2);
  if(step===2)void save('/users/me/onboarding/progress',{step:3},3);
  if(step===3)void save('/users/me/onboarding/boundaries',{accepted,policyVersion:server.policy?.version,locale:server.policy?.locale},4);
  if(step===4)void save('/users/me/location',locationBody(),5);
  if(step===5)void save('/users/me/interests',{needs},6);
  if(step===6)void save('/users/me/participation',{goals},7);
  if(step===7)void save('/users/me/community-format',{communityType:format},8);
  if(step===8)void save('/users/me/privacy',{...privacy,language:locale},9);
 };
 const valid=step===1?adult===true:step===3?accepted&&Boolean(server.policy):step===4?location.source!=='SKIPPED'&&locationInput.safeParse(locationBody()).success:step===8?privacyInput.safeParse(privacy).success:true;
 if(home)return <SpacesApp client={client} state={server} onLogout={onLogout} onSessionExpired={onSessionExpired} initialDestination={initialDestination} onDestinationHandled={onDestinationHandled}/>;
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
 <View style={s.header}><Text style={s.brand}>Sandar</Text><View style={s.row}>{(['en','id-ID'] as const).map(l=><Tactile key={l} accessibilityLabel={l==='en'?'English':'Bahasa Indonesia'} accessibilityRole="button" disabled={busy} onPress={()=>{setLocale(l);setPrivacy(p=>({...p,language:l}));}} style={s.language}><Text style={s.small}>{l==='en'?'EN':'ID'}</Text></Tactile>)}</View></View>
 <Text style={s.small}>{step+1} / 11 · {t('Your choices save as you continue.')}</Text><View accessibilityRole="progressbar" accessibilityValue={{min:0,max:11,now:step+1}} style={s.track}><View style={[s.progress,{width:`${(step+1)/11*100}%`}]}/></View>
 {(step===0||step===10)&&<Image source={step===0?welcomeImage:successImage} style={s.hero} accessible={false}/>}
 <Text accessibilityRole="header" style={s.title}>{t(stepTitles[step]!)}</Text>
 {loading?<ActivityIndicator accessibilityLabel={t('Loading your preferences')}/>:expired?<>{text('Your session ended. Sign in again.')}{button('Sign in again',onSessionExpired??onLogout)}</>:!initialized.current?<>{text('Onboarding is available only to verified Members.')}{button('Try again',()=>void load())}{button('Sign out',onLogout,false,true)}</>:<>
 {step===0&&<>{text('A few quick steps will help Sandar show more relevant spaces while keeping you in control of what you share.')}{['Set your preferences','Choose what kind of support you want to explore','Decide how you prefer to participate'].map(x=><View key={x} style={s.row}><Ionicons name="checkmark-circle-outline" size={20} color="#b65031"/>{text(x)}</View>)}</>}
 {step===1&&<>{text('Sandar is for adults aged 18 and over. We do not collect your date of birth.')}{choice('Yes, I’m 18 or older',adult===true,()=>setAdult(true),true)}{choice('No, I’m under 18',adult===false,()=>setAdult(false),true)}{adult===false&&<Text accessibilityRole="alert" style={s.error}>{t('Sandar is not available to under-18s. You cannot finish setup.')}</Text>}</>}
 {step===2&&<>{text('Sandar is a place for community discovery, non-clinical peer support, events and supportive spaces.')}{text('Sandar is not an emergency service, diagnosis, medical treatment, medication advice, automated clinical decision-making, or a replacement for a psychologist or psychiatrist.')}</>}
 {step===3&&<>{['Be kind and respectful','Share from your own experience','Do not diagnose others','Do not give medical instructions','Respect privacy','Report harmful content'].map(x=><View key={x} style={s.row}><Ionicons name="checkmark-circle-outline" size={20} color="#b65031"/>{text(x)}</View>)}{choice('I understand how participation works on Sandar.',accepted,()=>setAccepted(v=>!v))}<Text style={s.small}>{t('Guidelines version')}: {server.policy?.version??t('Unavailable')}</Text>{!server.policy&&button('Reload guidelines',()=>void load())}</>}
 {step===4&&<>{text('Location is optional. Choose a country and city, use your device, or skip. Exact coordinates never go to Sandar.')}{button('Use device location',()=>void locate(),false,true)}
 <Text style={s.label}>{t('Country')}</Text><TextInput accessibilityLabel={t('Search countries')} placeholder={t('Search countries')} value={countrySearch} onChangeText={setCountrySearch} editable={!busy} style={s.input}/>
 {countries.filter(c=>(c.name+' '+c.code).toLowerCase().includes(countrySearch.toLowerCase())).slice(0,countrySearch?8:3).map(c=>choice(c.name,location.country===c.code,()=>{setLocation(v=>({...v,source:'MANUAL',country:c.code,countryName:c.name,city:null}));setCitySearch('');setCityResults([]);setManual(false);},true))}
 {location.country&&text((location.countryName??countries.find(c=>c.code===location.country)?.name??location.country)+' · '+(location.city??t('Choose a city')))}
 {location.country&&<><Text style={s.label}>{t(manual?'Manual city':'Search cities')}</Text><TextInput accessibilityLabel={t(manual?'Manual city':'Search cities')} placeholder={t('City')} style={s.input} editable={!busy} maxLength={100} value={manual?location.city??'':citySearch} onChangeText={v=>{if(manual)setLocation(l=>({...l,city:v,source:'MANUAL'}));else{setCitySearch(v);setLocation(l=>({...l,city:null,source:'MANUAL'}));}}}/>
 {!manual&&(searching?<ActivityIndicator accessibilityLabel={t('Searching cities')}/>:<>{cityResults.map(name=>choice(name,location.city===name,()=>setLocation(v=>({...v,city:name,source:'DIRECTORY'})),true))}{cityResults.length===0&&text('No cities found. Enter your city manually or skip.')}</>)}</>}
 {directoryError&&<>{text('The city directory is unavailable. Retry or enter your city manually.')}<TextInput accessibilityLabel={t('Country code')} placeholder="ID" maxLength={2} autoCapitalize="characters" value={location.country??''} onChangeText={country=>setLocation(v=>({...v,country:country.toUpperCase(),countryName:undefined,city:null,source:'MANUAL'}))} style={s.input}/></>}{button('Enter city manually',()=>{setManual(true);track('location_manual_selected',4);},false,true)}
 {button('Skip location',()=>{const v={source:'SKIPPED' as const,country:null,city:null,permission:location.permission};setLocation(v);track('location_skipped',4);void save('/users/me/location',v,5);},false,true)}</>}
 {step===5&&<>{text('Choose what feels relevant. This isn’t a diagnosis. All selections are optional.')}{[...supportInterests,...needs.filter(n=>!(supportInterests as readonly string[]).includes(n))].map(n=>choice(labels[n]??n,needs.includes(n),()=>{setNeeds(v=>selectInterest(v,n));track('support_interest_selected',5);}))}</>}
 {step===6&&<>{text('Choose all that fit. Reading quietly is welcome, and you can change your choices later.')}{[...participationPreferences,...goals.filter(g=>!(participationPreferences as readonly string[]).includes(g))].map(g=>choice(labels[g]??g,goals.includes(g),()=>{setGoals(v=>v.includes(g)?v.filter(x=>x!==g):[...v,g]);track('participation_preference_selected',6);}))}</>}
 {step===7&&<>{text('Choose what feels comfortable. No preference is a valid choice.')}{(['ONLINE','LOCAL','MIXED','NO_PREFERENCE'] as const).map(v=>choice(labels[v]!,format===v,()=>{setFormat(v);track('community_format_selected',7);},true))}</>}
 {step===8&&<>{text('Your coarse location helps discovery but is not automatically public. Anonymous posting depends on each Space or Community. Notification preferences can be changed later; push permission is not required.')}
 <Text style={s.label}>{t('Display name')}</Text><TextInput accessibilityLabel={t('Display name')} style={s.input} value={privacy.displayName} maxLength={80} editable={!busy} onChangeText={displayName=>setPrivacy(p=>({...p,displayName}))}/>
 {toggle('Profile visible to members',privacy.profileVisibility==='MEMBERS',on=>setPrivacy(p=>({...p,profileVisibility:on?'MEMBERS':'HIDDEN'})))}{toggle('Display name in member directory',privacy.directoryVisibility==='DISPLAY_NAME',on=>setPrivacy(p=>({...p,directoryVisibility:on?'DISPLAY_NAME':'HIDDEN'})))}{toggle('Allow anonymous posting',privacy.allowAnonymousPosting,on=>setPrivacy(p=>({...p,allowAnonymousPosting:on})))}{!privacy.displayName.trim()&&text('A display name is required. It does not need to be your legal name.')}</>}
 {step===9&&<>{([['Location',location.source==='SKIPPED'?'Skipped':[location.city,location.countryName??location.country].filter(Boolean).join(', '),4],['Support interests',needs.map(n=>t(labels[n]??n)).join(', ')||t('Not selected'),5],['Participation',goals.map(g=>t(labels[g]??g)).join(', ')||t('Not selected'),6],['Community format',t(labels[format]!),7],['Privacy',[privacy.displayName,t(privacy.profileVisibility==='HIDDEN'?'Hidden profile':'Profile visible to members'),t(privacy.directoryVisibility==='HIDDEN'?'Hidden directory':'Display name in member directory'),t(privacy.allowAnonymousPosting?'Anonymous posting allowed':'Anonymous posting off')].join(' · '),8]] as const).map(([label,value,to])=><View key={label} style={s.summary}><Text style={s.label}>{t(label)}</Text><Text style={s.body}>{t(value)}</Text>{button('Edit '+label,()=>edit(to),false,true)}</View>)}{(!adult||!accepted)&&button('Review required boundaries',()=>edit(!adult?1:3),false,true)}{button('Finish setup',()=>void finish(),!adult||!accepted)}</>}
 {step===10&&<>{text('Your preferences are saved. You can change them later. Take part at your own pace.')}{button('Go to Member Home',()=>void enterHome())}</>}
 {!!notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{t(notice)}</Text>}
 {busy&&<ActivityIndicator accessibilityLabel={t(step===4?'Working on location':'Saving your preferences')}/>}
 {step<9&&button(step===2?'I understand':'Continue',next,!valid)}
 {step>0&&step<10&&button('Back',back,false,true)}
 </>}
 {!!error&&<><Text accessibilityRole="alert" style={s.error}>{t(error==='POLICY_VERSION_CHANGED'?'Guidelines changed. Review the latest boundaries.':error==='FORBIDDEN'||error==='EMAIL_VERIFICATION_REQUIRED'?'Onboarding is available only to verified Members.':'Unable to save. Your choices are still here. Check your connection and try again.')}</Text>{error==='POLICY_VERSION_CHANGED'&&button('Reload guidelines',()=>{setStep(3);void load();})}</>}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:'#fffaf4'},page:{padding:22,paddingBottom:32,maxWidth:520,width:'100%',alignSelf:'center'},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{fontFamily:'serif',fontSize:23,color:'#b65031'},language:{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'},title:{fontFamily:'serif',fontWeight:'600',fontSize:23,lineHeight:29,color:'#3b241b',marginVertical:18},body:{fontSize:14,lineHeight:21,color:'#68594f',marginVertical:7,flexShrink:1},label:{fontSize:14,fontWeight:'600',color:'#3b241b',marginTop:12},small:{fontSize:12,lineHeight:18,color:'#78665a'},row:{flexDirection:'row',gap:10,alignItems:'center'},flex:{flex:1},track:{height:4,backgroundColor:'#f3e4d6',borderRadius:2,marginTop:10},progress:{height:4,backgroundColor:'#b65031',borderRadius:2},hero:{width:'100%',height:132,resizeMode:'cover',borderRadius:12,marginTop:18},choice:{flexDirection:'row',alignItems:'center',gap:12,padding:12,minHeight:48,borderWidth:1,borderColor:'#e8cfbc',borderRadius:9,marginVertical:4,backgroundColor:'#fffdf9'},choiceText:{fontSize:14,lineHeight:21,color:'#3b241b',flex:1},selected:{borderColor:'#b65031',backgroundColor:'#ffeddf'},input:{borderWidth:1,borderColor:'#d9c9be',borderRadius:9,minHeight:48,padding:12,color:'#3b241b',backgroundColor:'#fffdf9',marginVertical:8},button:{backgroundColor:'#b65031',borderRadius:12,minHeight:48,padding:14,alignItems:'center',justifyContent:'center',marginTop:14},buttonText:{color:'#fff',fontWeight:'600',fontSize:14},secondary:{backgroundColor:'transparent',borderWidth:1,borderColor:'#d9ad94'},secondaryText:{color:'#a4472a'},disabled:{opacity:.45},error:{backgroundColor:'#fbe8df',color:'#8f3425',padding:12,marginVertical:10,borderRadius:9},notice:{backgroundColor:'#f8eadd',color:'#68594f',padding:12,marginVertical:10,borderRadius:9},summary:{padding:12,borderBottomWidth:1,borderColor:'#ead9c9'}});
