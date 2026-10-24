import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ClientError } from '../packages/auth-client/src/client.js';
vi.mock('react-native', () => ({ ActivityIndicator: 'ActivityIndicator', AppState: { addEventListener: () => ({ remove: () => { } }) }, Image: 'Image', Pressable: 'Pressable', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
import { MemberHomeScreen } from '../apps/mobile/src/home/MemberHomeScreen.js';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let renderer;
afterEach(async () => { await act(async () => renderer?.unmount()); renderer = undefined; });
const data = { displayName: 'Member', firstVisit: true, joinedSpaceIds: [], partners: [], events: [], continueContext: null, recentActivity: [], capabilities: { events: false, partnerParticipation: false } };
const api = (read) => ({ memberRequest: vi.fn((path, options) => options ? Promise.resolve({ recorded: true }) : read(path)) });
async function mount(client) { const navigate = vi.fn(async () => { }), logout = vi.fn(); await act(async () => { renderer = create(<MemberHomeScreen client={client} onNavigate={navigate} onLogout={logout}/>); }); return { navigate, logout }; }
const text = () => renderer.root.findAll(x => typeof x.type === 'string').map(x => [x.props.accessibilityLabel, ...x.children.filter(c => typeof c === 'string')].join(' ')).join(' ');
function button(label) { return renderer.root.findAll(x => x.type === 'Pressable' && x.props.accessibilityLabel === label)[0]; }
describe('Home rendered state and interactions', () => {
    it('renders first-time copy, empty sections, and active Home navigation', async () => { await mount(api(async (p) => p === '/home' ? data : [])); expect(text()).toContain('Welcome to Sandar.'); expect(text()).toContain('No Partner Communities are available'); expect(text()).toContain('Nothing upcoming yet.'); expect(button('Home').props.accessibilityState.selected).toBe(true); });
    it('renders returning personalized greeting', async () => { await mount(api(async (p) => p === '/home' ? { ...data, firstVisit: false } : [])); expect(text()).toContain('Welcome back, Member.'); expect(text()).not.toContain('Welcome to Sandar.'); });
    it('shows a real backend partner without a trust badge', async () => { await mount(api(async (p) => p === '/home' ? { ...data, partners: [{ id: 'real', name: 'Canonical community', purpose: 'Peer support', topic: 'Connection', operator: 'Operator', membership: 'NOT_JOINED' }] } : [])); expect(text()).toContain('Canonical community'); expect(text()).not.toContain('Verified'); });
    it('allows partial loading without a blank screen', async () => { let resolve; await mount(api(async (p) => p === '/home' ? data : new Promise(r => { resolve = r; }))); expect(text()).toContain('Welcome to Sandar.'); expect(text()).toContain('Loading section'); await act(async () => resolve([])); expect(text()).not.toContain('Loading section'); });
    it('recovers from network failure using Retry Home', async () => { let broken = true; const client = api(async (p) => { if (broken)
        throw new ClientError('NETWORK_ERROR', 'offline'); return p === '/home' ? data : []; }); await mount(client); expect(text()).toContain('Retry Home'); broken = false; await act(async () => button('Retry Home').props.onPress()); expect(text()).not.toContain('Retry Home'); expect(text()).toContain('Welcome to Sandar.'); });
    it('clears protected Home and disables navigation on session expiry', async () => { const { logout } = await mount(api(async () => { throw new ClientError('SESSION_INVALID', 'expired', 401); })); expect(text()).toContain('Your session has expired'); expect(text()).not.toContain('Official Sandar Spaces'); expect(button('Home').props.disabled).toBe(true); await act(async () => button('Sign in again').props.onPress()); expect(logout).toHaveBeenCalledTimes(1); });
    it('keeps session failure authoritative when the parallel response arrives later', async () => { let resolve; await mount(api(async (p) => { if (p === '/home')
        throw new ClientError('SESSION_INVALID', 'expired', 401); return new Promise(r => { resolve = r; }); })); await act(async () => resolve([])); expect(text()).toContain('Your session has expired'); expect(text()).not.toContain('Official Sandar Spaces'); });
    it('routes no-membership shortcuts, search and tabs through existing navigation', async () => { const { navigate } = await mount(api(async (p) => p === '/home' ? data : [])); await act(async () => button('Read quietly').props.onPress()); expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'discover' })); await act(async () => button("Share what's on my mind").props.onPress()); expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'discover' })); await act(async () => button('See upcoming events').props.onPress()); expect(navigate).toHaveBeenLastCalledWith({ tab: 'events' }); await act(async () => button('Profile').props.onPress()); expect(navigate).toHaveBeenLastCalledWith({ tab: 'profile' }); });
    it('retains visit id across refresh without duplicating first-visit classification locally', async () => { const client = api(async (p) => p === '/home' ? data : []); await mount(client); await act(async () => button('Home').props.onPress()); const calls = vi.mocked(client.memberRequest).mock.calls.filter(c => c[0] === '/home/visits'); expect(calls).toHaveLength(2); expect(calls[0][1]).toEqual(calls[1][1]); });
    it('renders official cards, joined context and content-free activity with their source', async () => {
        const space = {id:'space',name:'Work Stress',purpose:'Support',topic:'Work',status:'ACTIVE',membership:'JOINED',permissions:{read:true,post:true}};
        const {navigate}=await mount(api(async p=>p==='/home'?{...data,joinedSpaceIds:['space'],continueContext:{spaceId:'space',postId:null,visitedAt:'2026-09-27'},recentActivity:[{spaceId:'space',postId:'post',createdAt:'2026-09-27'}]}:[space]));
        expect(text()).toContain('Official Sandar Spaces');
        expect(text()).toContain('New post in Work Stress');
        await act(async()=>button('Continue in Work Stress').props.onPress());
        expect(navigate).toHaveBeenLastCalledWith({spaceId:'space',mode:'feed'});
        await act(async()=>button('Read quietly').props.onPress());
        expect(navigate).toHaveBeenLastCalledWith({spaceId:'space',mode:'feed'});
        await act(async()=>button("Share what's on my mind").props.onPress());
        expect(navigate).toHaveBeenLastCalledWith({spaceId:'space',mode:'compose'});
    });
    it('refresh removes stale continue context and gives a safe explanation',async()=>{
        let stale=false;const space={id:'space',name:'Work Stress',status:'ACTIVE',membership:'JOINED',permissions:{read:true,post:true}};
        await mount(api(async p=>p==='/home'?{...data,continueContext:stale?null:{spaceId:'space',postId:null,visitedAt:'2026-09-27'}}:[space]));
        expect(text()).toContain('Continue in Work Stress');stale=true;
        await act(async()=>button('Home').props.onPress());
        expect(text()).not.toContain('Continue in Work Stress');expect(text()).toContain('Your previous destination is no longer available');
    });

});

it('places Continue before supply sections, labels Official cards and keeps search scoped',async()=>{
 const space={id:'space',name:'Work Stress',status:'ACTIVE',membership:'JOINED',permissions:{read:true,post:true}};
 const {navigate}=await mount(api(async p=>p==='/home'?{...data,joinedSpaceIds:['space'],continueContext:{spaceId:'space',postId:'post',visitedAt:'2026-10-04'}}:[space]));
 const headers=renderer.root.findAll(x=>x.type==='Text'&&x.props.accessibilityRole==='header').map(x=>x.children.join(''));
 expect(headers.indexOf('Continue where you left off')).toBeLessThan(headers.indexOf('Official Sandar Spaces'));
 expect(text()).toContain('Official Sandar Space · Joined');expect(text()).toContain('Sandar');expect(text()).not.toContain('Log in');expect(text()).not.toContain('Join Sandar');
 const input=renderer.root.findByType('TextInput');expect(input.props.accessibilityLabel).toBe('Search spaces or topics');
 await act(async()=>input.props.onChangeText('work'));await act(async()=>renderer.root.findByType('TextInput').props.onSubmitEditing());expect(navigate).toHaveBeenLastCalledWith({tab:'discover',search:'work'});
 await act(async()=>button('Continue in Work Stress').props.onPress());expect(navigate).toHaveBeenLastCalledWith({spaceId:'space',postId:'post',mode:'detail'});
});
it('keeps usable Official supply when Home data fails, without invented membership',async()=>{
 const space={id:'space',name:'Work Stress',status:'ACTIVE',membership:'JOINED',permissions:{read:true,post:true}};
 await mount(api(async p=>{if(p==='/home')throw new ClientError('SERVER_ERROR','failed',500);return [space];}));
 expect(button('Work Stress')).toBeTruthy();expect(text()).toContain('Retry Home');expect(text()).not.toContain(' · Joined');expect(text()).not.toContain('Continue in');
});
