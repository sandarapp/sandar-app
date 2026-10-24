import {describe,it,expect,vi} from 'vitest';
import {coarseLocation,resumeStep,selectInterest,semanticFormat} from '../apps/mobile/src/onboarding/model.js';
import type {OnboardingState} from '../packages/contracts/src/onboarding.js';
const state:OnboardingState={ageConfirmed:false,boundariesVersion:null,boundariesLocale:null,location:null,preferences:null,privacy:null,completedAt:null,policy:{version:'v1',locale:'en'}};
describe('F03 resume and location model',()=>{
 it('does not resume beyond missing required gates',()=>{expect(resumeStep({...state,progressStep:9})).toBe(1);expect(resumeStep({...state,ageConfirmed:true,progressStep:9})).toBe(3);});
 it('resumes independent sections in order',()=>{const s={...state,ageConfirmed:true,boundariesVersion:'v1',boundariesLocale:'en',location:{source:'SKIPPED' as const,country:null,city:null,permission:'DENIED' as const}};expect(resumeStep(s)).toBe(5);expect(resumeStep({...s,interestsSaved:true})).toBe(6);expect(resumeStep({...s,interestsSaved:true,participationSaved:true})).toBe(7);expect(resumeStep({...s,interestsSaved:true,participationSaved:true,formatSaved:true})).toBe(8);});
 it('makes prefer-not-to-say exclusive in both directions',()=>{expect(selectInterest(['BURNOUT'],'PREFER_NOT_TO_SAY')).toEqual(['PREFER_NOT_TO_SAY']);expect(selectInterest(['PREFER_NOT_TO_SAY'],'LONELINESS')).toEqual(['LONELINESS']);expect(selectInterest(['LONELINESS'],'LONELINESS')).toEqual([]);});
 it('preserves legacy format wire values',()=>expect(semanticFormat).toMatchObject({LOCAL:'IN_PERSON',MIXED:'HYBRID'}));
 it('never looks up position when permission denied',async()=>{const lookup=vi.fn();expect(await coarseLocation({permission:async()=>false,lookup})).toEqual({permission:'DENIED',place:null,failed:false});expect(lookup).not.toHaveBeenCalled();});
 it('returns a coarse resolved place',async()=>expect(await coarseLocation({permission:async()=>true,lookup:async()=>({country:'ID',city:'Makassar'})})).toMatchObject({permission:'GRANTED',place:{country:'ID',city:'Makassar'},failed:false}));
 it('offers fallback on lookup failure',async()=>expect(await coarseLocation({permission:async()=>true,lookup:async()=>{throw Error('unavailable');}})).toMatchObject({failed:true,place:null}));
 it('bounds lookup time',async()=>{vi.useFakeTimers();try{const result=coarseLocation({permission:async()=>true,lookup:()=>new Promise(()=>{})},100);await vi.advanceTimersByTimeAsync(101);expect(await result).toMatchObject({failed:true,place:null});}finally{vi.useRealTimers();}});
});
