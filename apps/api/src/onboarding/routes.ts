import type { FastifyInstance } from 'fastify';
import type { Database, Transaction } from '../../../../packages/database/src/database.js';
import { transaction } from '../../../../packages/database/src/database.js';
import * as input from '../../../../packages/contracts/src/onboarding.js';
import { token } from '../../../../packages/contracts/src/auth.js';
import { authorize } from '../auth/authorization.js';
import type { AuthService } from '../auth/service.js';
import { ApiError, invalidSession } from '../core/errors.js';
import {countries,cities,countryName} from './directory.js';
import { randomUUID } from 'node:crypto';

export function addOnboarding(app: FastifyInstance, db: Database, auth: AuthService) {
  const policy = async (tx: Transaction, locale: string) => (await tx.query<{version:string;locale:string}>("SELECT version,locale FROM policies WHERE type='COMMUNITY_GUIDELINES' AND locale=$1 AND active AND effective_at<=now() FOR SHARE",[locale])).rows[0] ?? null;
  async function state(tx: Transaction, id: string, locale: string): Promise<input.OnboardingState> {
    const p=(await tx.query('SELECT * FROM member_profiles WHERE user_id=$1',[id])).rows[0];
    return {progressStep:p?.progress_step??0,interestsSaved:Boolean(p?.interests_saved_at),participationSaved:Boolean(p?.participation_saved_at),formatSaved:Boolean(p?.format_saved_at),ageConfirmed:Boolean(p?.age_confirmed_at),boundariesVersion:p?.boundaries_version??null,boundariesLocale:p?.boundaries_locale??null,
      location:p?.location_source ? {source:p.location_source,country:p.country,city:p.city,permission:p.location_permission,countryCode:p.country,countryName:p.country_name??countryName(p.country),cityName:p.city,locationSource:p.location_source}:null,
      preferences:(p?.preferences_saved_at||p?.interests_saved_at||p?.participation_saved_at||p?.format_saved_at) ? {needs:p.needs,goals:p.goals,communityType:p.community_type??'NO_PREFERENCE'}:null,
      privacy:p?.privacy_saved_at ? {displayName:p.display_name,language:p.language,profileVisibility:p.profile_visibility,directoryVisibility:p.directory_visibility,allowAnonymousPosting:p.allow_anonymous_posting}:null,
      completedAt:p?.onboarding_completed_at?.toISOString()??null,policy:await policy(tx,locale)};
  }
  const routes = [
    ['GET','/v1/users/me/onboarding','get'],
    ['GET','/v1/locations/countries','countries'],
    ['GET','/v1/locations/cities','cities'],
    ['POST','/v1/users/me/onboarding/analytics','analytics'],
    ['PATCH','/v1/users/me/onboarding/progress','progress'],
    ['PATCH','/v1/users/me/interests','interests'],
    ['PATCH','/v1/users/me/participation','participation'],
    ['PATCH','/v1/users/me/community-format','format'],
    ['PATCH','/v1/users/me/onboarding/age','age'],
    ['PATCH','/v1/users/me/onboarding/boundaries','boundaries'],
    ['PATCH','/v1/users/me/location','location'],
    ['PATCH','/v1/users/me/preferences','preferences'],
    ['PATCH','/v1/users/me/privacy','privacy'],
    ['POST','/v1/users/me/onboarding/complete','complete']
  ] as const;
  for (const [method,url,step] of routes) app.route({method,url,handler:async request => {
    const header=request.headers.authorization;
    if(!header?.startsWith('Bearer ')) throw invalidSession();
    const parsed=token.safeParse(header.slice(7));if(!parsed.success) throw invalidSession();
    const preferred=request.headers['accept-language']?.split(',')[0]?.split(';')[0];
    const locale=preferred && (input.supportedLocales as readonly string[]).includes(preferred) ? preferred : input.defaultMemberLocale;
    return transaction(db,async tx=>{
      const user=await auth.authenticate(parsed.data,tx);
      // Serialize member mutations and recheck authorization after acquiring the account lock.
      const locked=(await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
      authorize(locked,'onboarding:write');
      if(step==='countries')return {data:countries,error:null};
      if(step==='cities'){const q=request.query as Record<string,string>;if(!q.country||!countryName(q.country))throw new ApiError(400,'VALIDATION_ERROR','Choose a country.');return {data:(cities[q.country]??[]).filter(name=>name.toLowerCase().includes((q.q??'').slice(0,100).toLowerCase())).slice(0,20),error:null};}
      if(step==='analytics'){const v=input.analyticsInput.parse(request.body);if(v.event==='member_onboarding_completed')throw new ApiError(400,'VALIDATION_ERROR','Completion is recorded by the server.');await tx.query('INSERT INTO onboarding_analytics(id,event,step) VALUES($1,$2,$3)',[randomUUID(),v.event,v.step??null]);return {data:{accepted:true},error:null};}
      if(step==='get') return {data:await state(tx,user.id,locale),error:null};
      await tx.query('INSERT INTO member_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
      const current=await state(tx,user.id,locale);
      if(current.completedAt && step!=='complete') throw new ApiError(409,'ONBOARDING_COMPLETED','Onboarding sudah selesai.');
      if(step==='progress'){const v=input.progressInput.parse(request.body);if((v.step>1&&!current.ageConfirmed)||(v.step>3&&(!current.policy||current.boundariesVersion!==current.policy.version||current.boundariesLocale!==current.policy.locale)))throw new ApiError(409,'ONBOARDING_INCOMPLETE','Complete the required gates.');await tx.query('UPDATE member_profiles SET progress_step=$2 WHERE user_id=$1',[user.id,v.step]);}
      if(step==='age') {input.ageInput.parse(request.body);await tx.query('UPDATE member_profiles SET age_confirmed_at=COALESCE(age_confirmed_at,now()) WHERE user_id=$1',[user.id]);}
      if(step==='boundaries') {
        const value=input.boundariesInput.parse(request.body);
        if(!current.policy || value.policyVersion!==current.policy.version || value.locale!==current.policy.locale) throw new ApiError(409,'POLICY_VERSION_CHANGED','Baca batasan komunitas terbaru.');
        await tx.query('UPDATE member_profiles SET boundaries_version=$2,boundaries_locale=$3 WHERE user_id=$1',[user.id,value.policyVersion,value.locale]);
        await tx.query(`INSERT INTO consent_records(id,user_id,consent_type,policy_version,locale,status) VALUES($1,$2,'COMMUNITY_GUIDELINES',$3,$4,'ACCEPTED') ON CONFLICT(user_id,consent_type,policy_version,locale) DO UPDATE SET status='ACCEPTED',accepted_at=now(),withdrawn_at=NULL`,[randomUUID(),user.id,value.policyVersion,value.locale]);
      }
      if(step==='location') {const v=input.locationInput.parse(request.body);if(v.country&&!countryName(v.country))throw new ApiError(400,'VALIDATION_ERROR','Choose a valid country.');if(v.source==='DIRECTORY'&&!(cities[v.country!]??[]).includes(v.city!))throw new ApiError(400,'VALIDATION_ERROR','Choose a city from this country or use manual entry.');await tx.query('UPDATE member_profiles SET location_source=$2,country=$3,city=$4,location_permission=$5,country_name=$6 WHERE user_id=$1',[user.id,v.source,v.country,v.city,v.permission,countryName(v.country)]);}
      if(step==='preferences') {const v=input.preferencesInput.parse(request.body);await tx.query('UPDATE member_profiles SET needs=$2,goals=$3,community_type=$4,preferences_saved_at=now(),interests_saved_at=now(),participation_saved_at=now(),format_saved_at=now() WHERE user_id=$1',[user.id,v.needs,v.goals,v.communityType]);}
      if(step==='interests'){const v=input.interestsInput.parse(request.body);await tx.query('UPDATE member_profiles SET needs=$2,interests_saved_at=now() WHERE user_id=$1',[user.id,v.needs]);}
      if(step==='participation'){const v=input.participationInput.parse(request.body);await tx.query('UPDATE member_profiles SET goals=$2,participation_saved_at=now() WHERE user_id=$1',[user.id,v.goals]);}
      if(step==='format'){const v=input.formatInput.parse(request.body);await tx.query('UPDATE member_profiles SET community_type=$2,format_saved_at=now() WHERE user_id=$1',[user.id,v.communityType]);}
      if(['interests','participation','format'].includes(step))await tx.query('UPDATE member_profiles SET preferences_saved_at=now() WHERE user_id=$1 AND interests_saved_at IS NOT NULL AND participation_saved_at IS NOT NULL AND format_saved_at IS NOT NULL',[user.id]);
      if(step==='privacy') {const v=input.privacyInput.parse(request.body);await tx.query('UPDATE member_profiles SET display_name=$2,profile_visibility=$3,directory_visibility=$4,allow_anonymous_posting=$5,language=$6,privacy_saved_at=now() WHERE user_id=$1',[user.id,v.displayName,v.profileVisibility,v.directoryVisibility,v.allowAnonymousPosting,v.language]);}
      if(step==='complete') {
        if(!current.ageConfirmed || !current.policy || current.boundariesVersion!==current.policy.version || current.boundariesLocale!==current.policy.locale || !current.location || !current.preferences || !current.interestsSaved || !current.participationSaved || !current.formatSaved || !current.privacy) throw new ApiError(409,'ONBOARDING_INCOMPLETE','Lengkapi langkah wajib sebelum melanjutkan.');
        const accepted=(await tx.query("SELECT 1 FROM consent_records WHERE user_id=$1 AND consent_type='COMMUNITY_GUIDELINES' AND policy_version=$2 AND locale=$3 AND status='ACCEPTED'",[user.id,current.policy.version,current.policy.locale])).rowCount;
        if(!accepted) throw new ApiError(409,'CONSENT_REQUIRED','Setujui batasan komunitas.');
        await tx.query('UPDATE member_profiles SET onboarding_completed_at=COALESCE(onboarding_completed_at,now()) WHERE user_id=$1',[user.id]);
        await tx.query("UPDATE users SET status='ACTIVE',updated_at=now() WHERE id=$1",[user.id]);
        if(!current.completedAt)await tx.query("INSERT INTO onboarding_analytics(id,event,step) VALUES($1,'member_onboarding_completed',10)",[randomUUID()]);
      }
      const nextStep=({age:2,boundaries:4,location:5,interests:6,participation:7,format:8,privacy:9} as Record<string,number>)[step];
      if(nextStep!==undefined)await tx.query('UPDATE member_profiles SET progress_step=$2 WHERE user_id=$1',[user.id,nextStep]);
      await tx.query('UPDATE member_profiles SET updated_at=now() WHERE user_id=$1',[user.id]);
      return {data:await state(tx,user.id,locale),error:null};
    });
  }});
}
