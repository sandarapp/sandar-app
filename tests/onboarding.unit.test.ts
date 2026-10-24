import {describe,it,expect} from 'vitest';
import {ageInput,locationInput,preferencesInput,privacyInput} from '../packages/contracts/src/onboarding.js';
describe('shared onboarding validation',()=>{
 it('blocks underage continuation',()=>expect(ageInput.safeParse({confirmed:false}).success).toBe(false));
 it('allows privacy-preserving location skip',()=>expect(locationInput.safeParse({source:'SKIPPED',country:null,city:null,permission:'DENIED'}).success).toBe(true));
 it('requires a complete manual location',()=>expect(locationInput.safeParse({source:'MANUAL',country:'ID',city:'',permission:'NOT_REQUESTED'}).success).toBe(false));
 it('keeps support preferences optional',()=>expect(preferencesInput.safeParse({needs:[],goals:[],communityType:'NO_PREFERENCE'}).success).toBe(true));
 it('rejects duplicate needs',()=>expect(preferencesInput.safeParse({needs:['CONNECTION','CONNECTION'],goals:[],communityType:'ONLINE'}).success).toBe(false));
 it('requires a display name and explicit privacy values',()=>expect(privacyInput.safeParse({displayName:'',profileVisibility:'HIDDEN',directoryVisibility:'HIDDEN',allowAnonymousPosting:true}).success).toBe(false));
});
