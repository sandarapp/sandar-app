import type {OnboardingState} from '../../contracts/src/onboarding.js';
// Shared by the mobile and web onboarding so both resume at the same step.
export function selectInterest<T extends string>(values:T[],value:T):T[]{
 if(values.includes(value))return values.filter(x=>x!==value);
 return value==='PREFER_NOT_TO_SAY'?[value]:[...values.filter(x=>x!=='PREFER_NOT_TO_SAY'),value];
}
export function resumeStep(s:OnboardingState):number{
 const saved=s.progressStep??0;
 if(!s.ageConfirmed)return Math.min(saved,1);
 if(!s.policy||s.boundariesVersion!==s.policy.version||s.boundariesLocale!==s.policy.locale)return Math.min(Math.max(saved,2),3);
 if(!s.location)return 4;
 if(!s.interestsSaved)return 5;
 if(!s.participationSaved)return 6;
 if(!s.formatSaved)return 7;
 if(!s.privacy)return 8;
 return 9;
}
