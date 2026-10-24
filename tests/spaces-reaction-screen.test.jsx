import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('react-native',()=>({ActivityIndicator:'ActivityIndicator',Alert:{alert:vi.fn()},AppState:{addEventListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}})},Image:'Image',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:s=>s},Text:'Text',TextInput:'TextInput',View:'View'}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeAreaView'}));
vi.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
vi.mock('expo-crypto',()=>({randomUUID:()=> 'test-request'}));
vi.mock('../apps/mobile/src/home/MemberHomeScreen',()=>({MemberHomeScreen:()=>null}));
import {SpacesApp} from '../apps/mobile/src/spaces/SpacesApp';
import {ClientError} from '../packages/auth-client/src/client';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let tree;
afterEach(async()=>{await act(async()=>tree?.unmount());});
const node=label=>tree.root.findAll(x=>x.type==='Pressable'&&x.props.accessibilityLabel===label)[0];
const click=async label=>{await act(async()=>node(label).props.onPress());};
async function mount(){
 let selected=false,fail=false,release;
 const space={id:'space',status:'ACTIVE',membership:'JOINED',permissions:{read:true,post:true,comment:true}};
 const post=()=>({id:'post',body:'An experience',identityMode:'ANONYMOUS',authorName:'Anonymous Member',createdAt:'2026-10-03',reactions:[{type:'SUPPORT',selected}]});
 const client={memberRequest:vi.fn(async(path,options={})=>{
  if(path.includes('/reactions')){await new Promise(r=>{release=r;});if(fail)throw new ClientError('NETWORK_ERROR','failed');selected=options.method!=='DELETE';return post();}
  if(path==='/spaces')return [space];if(path==='/spaces/space')return space;if(path.endsWith('/comments'))return [];if(path.endsWith('/posts'))return [post()];if(path==='/space-posts/post')return post();return {};
 })};
 await act(async()=>{tree=create(<SpacesApp client={client} state={{}} onLogout={()=>{}} initialDestination={{spaceId:'space',postId:'post'}}/>);});
 return {client,finish:async()=>{await act(async()=>release());},fail:()=>{fail=true;}};
}
it('adds/removes/re-adds only after authoritative response and disables duplicate taps',async()=>{
 const env=await mount();
 for(const expected of [true,false,true]){
  expect(node('Support').props.accessibilityState.selected).toBe(!expected);await click('Support');expect(node('Support').props.disabled).toBe(true);expect(node('Support').props.accessibilityState.selected).toBe(!expected);
  await env.finish();expect(node('Support').props.accessibilityState.selected).toBe(expected);
 }
 expect(env.client.memberRequest.mock.calls.filter(([p])=>p.includes('/reactions')).map(([p,o])=>[p,o])).toEqual([['/space-posts/post/reactions',{method:'POST',body:{type:'SUPPORT'}}],['/space-posts/post/reactions/SUPPORT',{method:'DELETE'}],['/space-posts/post/reactions',{method:'POST',body:{type:'SUPPORT'}}]]);
});
it.each([false,true])('failed reaction preserves server state after retry (selected=%s)',async selected=>{
 const env=await mount();if(selected){await click('Support');await env.finish();}env.fail();await click('Support');await env.finish();expect(node('Try again')).toBeTruthy();await click('Try again');expect(node('Support').props.accessibilityState.selected).toBe(selected);
});
