import React from 'react';
import {act,create} from 'react-test-renderer';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const env=vi.hoisted(()=>({foreground:null,permission:vi.fn(),position:vi.fn(),geocode:vi.fn(),reduced:true,animations:[]}));
vi.mock('react-native',()=>({AccessibilityInfo:{isReduceMotionEnabled:async()=>env.reduced,addEventListener:()=>({remove(){}})},Animated:{View:'AnimatedView',Value:class{setValue(){} stopAnimation(){}},timing:(_v,opts)=>{env.animations.push(opts);return {start(){},stop(){}};}},Easing:{out:x=>x,quad:x=>x},ActivityIndicator:'ActivityIndicator',AppState:{addEventListener:(_e,fn)=>{env.foreground=fn;return {remove(){}};}},BackHandler:{addEventListener:()=>({remove(){}})},Image:'Image',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:s=>s},Switch:'Switch',Text:'Text',TextInput:'TextInput',View:'View'}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeAreaView'}));
vi.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
vi.mock('expo-location',()=>({Accuracy:{Low:1},requestForegroundPermissionsAsync:env.permission,getCurrentPositionAsync:env.position,reverseGeocodeAsync:env.geocode}));
vi.mock('../apps/mobile/src/spaces/SpacesApp',()=>({SpacesApp:props=>React.createElement('MemberHomeDestination',props)}));
import {MemberOnboarding} from '../apps/mobile/src/MemberOnboarding';
import {ClientError} from '../packages/auth-client/src/client';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let tree,state,client,failPath;
const privacy={displayName:'Development member',language:'en',profileVisibility:'HIDDEN',directoryVisibility:'HIDDEN',allowAnonymousPosting:true};
const skip={source:'SKIPPED',country:null,city:null,permission:'NOT_REQUESTED'};
beforeEach(()=>{failPath=null;env.reduced=true;env.animations=[];env.permission.mockReset().mockResolvedValue({granted:false});env.position.mockReset().mockResolvedValue({coords:{latitude:1,longitude:2}});env.geocode.mockReset().mockResolvedValue([{isoCountryCode:'ID',city:'Makassar'}]);state={ageConfirmed:false,boundariesVersion:null,boundariesLocale:null,location:null,preferences:null,privacy:null,completedAt:null,policy:{version:'v1',locale:'en'},progressStep:0,interestsSaved:false,participationSaved:false,formatSaved:false};client={session:vi.fn(async()=>({id:'member',accountType:'MEMBER',status:state.completedAt?'ACTIVE':'ONBOARDING_INCOMPLETE',emailVerifiedAt:'yes'})),memberRequest:vi.fn(async(path,options={})=>{
 if(path===failPath)throw new ClientError('OFFLINE','offline');
 const b=options.body;
 if(path.endsWith('/analytics'))return {accepted:true};
 if(path==='/locations/countries')return [{code:'ID',name:'Indonesia'},{code:'AU',name:'Australia'}];
 if(path.startsWith('/locations/cities'))return path.includes('country=ID')?['Makassar']:['Sydney'];
 if(options.method==='PATCH'){
 if(state.completedAt)throw new ClientError('ONBOARDING_COMPLETED','complete',409);
 if(path.endsWith('/age'))state.ageConfirmed=true;
 if(path.endsWith('/boundaries')){state.boundariesVersion='v1';state.boundariesLocale=state.policy.locale;}
 if(path.endsWith('/location'))state.location=b;
 if(path.endsWith('/progress'))state.progressStep=b.step;
 if(path.endsWith('/interests')){state.preferences={goals:[],communityType:'NO_PREFERENCE',...state.preferences,needs:b.needs};state.interestsSaved=true;}
 if(path.endsWith('/participation')){state.preferences={needs:[],communityType:'NO_PREFERENCE',...state.preferences,goals:b.goals};state.participationSaved=true;}
 if(path.endsWith('/community-format')){state.preferences={needs:[],goals:[],...state.preferences,communityType:b.communityType};state.formatSaved=true;}
 if(path.endsWith('/preferences'))state.preferences=b;
 if(path.endsWith('/privacy'))state.privacy=b;
 }
 if(path.endsWith('/complete'))state.completedAt='2026-10-02';
 return structuredClone({...state,policy:{...state.policy,locale:options.locale??'en'}});
 })};});
afterEach(async()=>{await act(async()=>tree?.unmount());tree=undefined;});
const node=(label,type='Pressable')=>tree.root.findAll(x=>x.type===type&&x.props.accessibilityLabel===label)[0];
const text=()=>tree.root.findAll(x=>typeof x.type==='string').flatMap(x=>x.children.filter(c=>typeof c==='string')).join(' ');
async function mount(){await act(async()=>{tree=create(<MemberOnboarding client={client} onLogout={()=>{}}/>);});}
async function click(label){const n=node(label);expect(n,`missing ${label}`).toBeTruthy();expect(n.props.disabled,`disabled ${label}`).toBeFalsy();await act(async()=>{await n.props.onPress();});}
async function fill(label,value){await act(async()=>node(label,'TextInput').props.onChangeText(value));}
function atLocation(){Object.assign(state,{ageConfirmed:true,boundariesVersion:'v1',boundariesLocale:'en'});}
function atInterests(){atLocation();state.location=skip;}
function atReview(){atInterests();Object.assign(state,{interestsSaved:true,participationSaved:true,formatSaved:true,preferences:{needs:['BURNOUT'],goals:['READ_QUIETLY'],communityType:'LOCAL'},privacy});}
describe('F03 mobile screen behavior',()=>{
 it('keeps age, explanation and acknowledged boundaries as separate steps',async()=>{await mount();await click('Continue');expect(node('Continue').props.disabled).toBe(true);await click('No, I’m under 18');expect(text()).toContain('cannot finish');expect(node('Continue').props.disabled).toBe(true);await click('Yes, I’m 18 or older');await click('Continue');expect(text()).toContain('What Sandar is');await click('I understand');expect(text()).toContain('Support, don’t diagnose');expect(node('Continue').props.disabled).toBe(true);await click('I understand how participation works on Sandar.');await click('Continue');expect(text()).toContain('Find local connections');});
 it('preserves unsaved acknowledgement after foreground refresh',async()=>{atLocation();state.boundariesVersion=null;state.progressStep=3;await mount();await click('I understand how participation works on Sandar.');await act(async()=>env.foreground('active'));expect(node('I understand how participation works on Sandar.').props.accessibilityState.checked).toBe(true);});
 it('denial offers manual and skip without position lookup',async()=>{atLocation();await mount();await click('Use device location');expect(text()).toContain('Location permission denied');expect(env.position).not.toHaveBeenCalled();await click('Skip location');expect(state.location).toEqual({...skip,permission:'DENIED'});expect(text()).toContain('What would you like support');});
 it('sends only coarse city/country after permission grant',async()=>{atLocation();env.permission.mockResolvedValue({granted:true});await mount();await click('Use device location');await click('Continue');expect(state.location).toEqual({source:'DEVICE',country:'ID',city:'Makassar',permission:'GRANTED'});});
 it('lookup failure offers manual/skip',async()=>{atLocation();env.permission.mockResolvedValue({granted:true});env.position.mockRejectedValue(Error('unavailable'));await mount();await click('Use device location');expect(text()).toContain('Location lookup failed');await click('Skip location');expect(state.location.source).toBe('SKIPPED');});
 it('supports manual city and clears incompatible city on country change',async()=>{atLocation();await mount();await click('Indonesia');await click('Enter city manually');await fill('Manual city','Makassar');expect(node('Continue').props.disabled).toBe(false);await click('Australia');expect(node('Continue').props.disabled).toBe(true);await click('Enter city manually');await fill('Manual city','Sydney');await click('Continue');expect(state.location).toMatchObject({country:'AU',city:'Sydney',source:'MANUAL'});});
 it('country-scoped directory search saves directory provenance',async()=>{atLocation();await mount();await click('Indonesia');await act(async()=>new Promise(r=>setTimeout(r,240)));expect(client.memberRequest).toHaveBeenCalledWith('/locations/cities?country=ID&q=');await click('Makassar');await click('Continue');expect(state.location.source).toBe('DIRECTORY');});
 it('enforces Prefer Not to Say exclusivity and preserves choices on Back',async()=>{atInterests();await mount();await click('Burnout');await click('Loneliness');await click('Prefer not to say');expect(node('Burnout').props.accessibilityState.checked).toBe(false);await click('Continue');expect(state.preferences.needs).toEqual(['PREFER_NOT_TO_SAY']);await click('Back');expect(node('Prefer not to say').props.accessibilityState.checked).toBe(true);await click('Loneliness');expect(node('Prefer not to say').props.accessibilityState.checked).toBe(false);});
 it('saves independent participation, legacy format and privacy',async()=>{atInterests();state.interestsSaved=true;await mount();await click('Read quietly');await click('Attend events');await click('Continue');expect(state.preferences.goals).toEqual(['READ_QUIETLY','ATTEND_EVENTS']);await click('Hybrid');await click('Continue');expect(state.preferences.communityType).toBe('MIXED');expect(node('Continue').props.disabled).toBe(true);await fill('Display name','New display');await click('Continue');expect(state.privacy.displayName).toBe('New display');expect(text()).toContain('Review your choices');});
 it('review edit preserves values and returns to review',async()=>{atReview();await mount();await click('Edit Support interests');expect(node('Burnout').props.accessibilityState.checked).toBe(true);await click('Loneliness');await click('Continue');expect(text()).toContain('Review your choices');expect(state.preferences.needs).toEqual(['BURNOUT','LONELINESS']);});
 it('completion refreshes authoritative session before rendering Home',async()=>{atReview();await mount();await click('Finish setup');expect(client.session).toHaveBeenCalled();expect(text()).toContain('You’re all set');expect(tree.root.findAllByType('MemberHomeDestination')).toHaveLength(0);await click('Go to Member Home');expect(tree.root.findAllByType('MemberHomeDestination')).toHaveLength(1);});
 it('failed persistence retains review and never calls complete',async()=>{atReview();failPath='/users/me/privacy';await mount();await click('Finish setup');expect(state.completedAt).toBeNull();expect(client.memberRequest.mock.calls.some(([p])=>p.endsWith('/complete'))).toBe(false);expect(text()).toContain('Your choices are still here');failPath=null;await click('Finish setup');expect(text()).toContain('You’re all set');});
 it('does not navigate when authoritative refresh fails after completion',async()=>{atReview();client.session.mockRejectedValue(new ClientError('OFFLINE','offline'));await mount();await click('Finish setup');expect(tree.root.findAllByType('MemberHomeDestination')).toHaveLength(0);expect(text()).not.toContain('You’re all set');});
 it('resumes saved incomplete progress after remount',async()=>{atInterests();state.interestsSaved=true;state.preferences={needs:['BURNOUT'],goals:[],communityType:'NO_PREFERENCE'};await mount();expect(text()).toContain('How would you like to participate?');await act(async()=>tree.unmount());tree=undefined;await mount();expect(text()).toContain('How would you like to participate?');});
 it('completed members skip F03 through the resolver',async()=>{atReview();state.completedAt='done';await mount();expect(client.session).toHaveBeenCalled();expect(tree.root.findAllByType('MemberHomeDestination')).toHaveLength(1);});
 it('language switch preserves unsaved selections',async()=>{atInterests();await mount();await click('Burnout');await click('Bahasa Indonesia');expect(node('Kelelahan').props.accessibilityState.checked).toBe(true);await click('English');expect(node('Burnout').props.accessibilityState.checked).toBe(true);});
 it.each([401,403])('does not expose steps when server denies with %s',async status=>{client.memberRequest.mockRejectedValue(new ClientError('FORBIDDEN','denied',status));await mount();expect(node('Continue')).toBeUndefined();expect(tree.root.findAllByType('MemberHomeDestination')).toHaveLength(0);});
 it('honors reduced-motion press feedback',async()=>{await mount();await act(async()=>node('Continue').props.onPressIn({}));expect(env.animations.at(-1)).toMatchObject({duration:0,toValue:1});});
 it('emits the initial Welcome step view without preferences or identity',async()=>{await mount();expect(client.memberRequest).toHaveBeenCalledWith('/users/me/onboarding/analytics',{method:'POST',body:{event:'member_onboarding_step_viewed',step:0}});for(const [path,options] of client.memberRequest.mock.calls.filter(([p])=>p.endsWith('/analytics')))expect(Object.keys(options.body).every(k=>['event','step'].includes(k))).toBe(true);});
});

it('recovers when completion commits but authoritative refresh was offline',async()=>{atReview();client.session.mockRejectedValueOnce(new ClientError('OFFLINE','offline'));await mount();await click('Finish setup');expect(state.completedAt).toBeTruthy();expect(text()).not.toContain('You’re all set');await click('Finish setup');expect(text()).toContain('You’re all set');});
it('restores Indonesian and requires acknowledgement when only English consent exists',async()=>{atReview();state.progressStep=9;state.privacy={...privacy,language:'id-ID'};await mount();expect(text()).toContain('Dukung, jangan mendiagnosis');expect(node('Lanjut').props.disabled).toBe(true);expect(node('Selesaikan pengaturan')).toBeUndefined();});

it('uses the saved locale policy before selecting the cold-start resume step',async()=>{atReview();state.privacy={...privacy,language:'id-ID'};state.boundariesLocale='id-ID';state.progressStep=9;await mount();expect(text()).toContain('Tinjau pilihanmu');expect(node('Selesaikan pengaturan').props.disabled).toBe(false);});
