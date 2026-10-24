import {describe,it,expect} from 'vitest';
import {activeSpaces,joinedSpaces,shortcut,greeting,homeTabs,homeCopy} from '../apps/mobile/src/home/model.js';
import type {Space} from '../packages/contracts/src/spaces.js';
const space={id:'joined',status:'ACTIVE',membership:'JOINED',permissions:{read:true,post:true}} as Space;
describe('Home navigation policy',()=>{
 it('Read quietly opens an eligible joined feed, not a composer',()=>expect(shortcut('read',[space])).toEqual({spaceId:'joined',mode:'feed'}));
 it('Read quietly without membership offers discovery without contribution',()=>expect(shortcut('read',[])).toMatchObject({tab:'discover',notice:expect.stringContaining('Sharing is always optional')}));
 it('Share uses an eligible joined context',()=>expect(shortcut('share',[space])).toEqual({spaceId:'joined',mode:'compose'}));
 it('Share never creates a context-free post',()=>{expect(shortcut('share',[])).toMatchObject({tab:'discover'});expect(shortcut('share',[{...space,permissions:{...space.permissions,post:false}}])).toMatchObject({tab:'discover'});});
 it('Discovery and Events shortcuts retain their destination',()=>{expect(shortcut('find',[])).toEqual({tab:'discover'});expect(shortcut('events',[])).toEqual({tab:'events'});});
 it('filters restricted spaces and stale memberships',()=>{const inputs=[space,{...space,id:'restricted',status:'RESTRICTED' as const},{...space,id:'banned',membership:'BANNED' as const},{...space,id:'left',membership:'LEFT' as const}];expect(activeSpaces(inputs).map(x=>x.id)).toEqual(['joined','left']);expect(joinedSpaces(inputs)).toEqual([space]);});
 it('keeps event absence honest',()=>expect(homeCopy.events).toContain('Nothing upcoming yet'));
 it('keeps the required five tabs without global Feed',()=>expect(homeTabs).toEqual(['home','discover','events','notifications','profile']));
 it('uses time-of-day greeting without mood inference',()=>{expect(greeting(9)).toBe('Good morning');expect(greeting(15)).toBe('Good afternoon');expect(greeting(22)).toBe('Good evening');});
});
