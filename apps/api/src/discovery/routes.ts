import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import {discoveryInput,discoveryAnalytics,discoveryLabels,type DiscoveryData,type DiscoveryResult} from '../../../../packages/contracts/src/discovery.js';
import {ApiError} from '../core/errors.js';
import {rateLimit} from '../core/rate-limit.js';
import {contentLocale} from '../spaces/routes.js';
import {memberRequest} from '../core/member-request.js';
export function addDiscovery(app:FastifyInstance,db:Database){
 // Searching and recording discovery views only read or append, so no shared lock is needed.
 const run=(req:FastifyRequest,work:(tx:Transaction,userId:string)=>Promise<unknown>)=>memberRequest(db,req,{write:false,
  onboardingError:()=>new ApiError(403,'ONBOARDING_REQUIRED','Complete onboarding first.'),
  before:async member=>{await rateLimit(db,'discovery:'+member.id,180,60);}},(tx,member)=>work(tx,member.id));
 app.post('/v1/discovery/search',req=>run(req,async(tx,userId):Promise<DiscoveryData>=>{
  const f=discoveryInput.parse(req.body);
  const profile=(await tx.query('SELECT needs,goals,community_type,country,city FROM member_profiles WHERE user_id=$1',[userId])).rows[0];
  const rows=(await tx.query(`SELECT s.id,s.kind,COALESCE(tr.name,s.name) AS name,COALESCE(tr.purpose,s.purpose) AS purpose,COALESCE(tr.topic,s.topic) AS topic,s.development_sample,d.topics,d.participation,d.format,d.country,d.city
   FROM support_spaces s LEFT JOIN discovery_profiles d ON d.space_id=s.id LEFT JOIN support_space_translations tr ON tr.space_id=s.id AND tr.locale=$2
   LEFT JOIN space_memberships m ON m.space_id=s.id AND m.user_id=$1
   LEFT JOIN users owner ON owner.id=d.owner_user_id LEFT JOIN community_application_states a ON a.user_id=owner.id
   WHERE s.status='ACTIVE' AND COALESCE(m.status,'NOT_JOINED') NOT IN ('BANNED','RESTRICTED')
   AND (d.space_id IS NULL OR d.published)
   AND (s.kind='OFFICIAL_SANDAR' OR (NOT s.development_sample AND d.published AND cardinality(d.topics)>0 AND d.format IS NOT NULL AND length(trim(s.name))>0 AND length(trim(s.purpose))>0 AND owner.account_type='COMMUNITY' AND owner.email_verified_at IS NOT NULL AND owner.deleted_at IS NULL AND owner.status NOT IN ('SUSPENDED','DEACTIVATED','DELETED') AND a.status='APPROVED'))`,[userId,contentLocale(req)])).rows;
  const lower=(s:string)=>s.toLocaleLowerCase('en');const q=lower(f.q),wantedFormat=({LOCAL:'IN_PERSON',MIXED:'HYBRID',ONLINE:'ONLINE'} as Record<string,string>)[profile.community_type];
  const needs=(profile.needs as string[]).filter(x=>x!=='PREFER_NOT_TO_SAY');
  const eligible=rows.filter(r=>(f.type==='ALL'||r.kind===f.type)&&(f.format==='ALL'||r.format===f.format)&&(!f.country||r.country===f.country)&&(!f.city||lower(r.city??'').includes(lower(f.city)))&&f.topics.every(t=>(r.topics??[]).includes(t))&&f.participation.every(t=>(r.participation??[]).includes(t))&&(!q||lower([r.name,r.purpose,r.topic,r.city,...(r.topics??[]).map((t:string)=>discoveryLabels[t])].join(' ')).includes(q)));
  const rank=(r:typeof rows[number])=>[q?(lower(r.name)===q?2:lower(r.name).includes(q)?1:0):0,(r.topics??[]).filter((t:string)=>needs.includes(t)).length,(r.participation??[]).filter((t:string)=>profile.goals.includes(t)).length,Number(Boolean(wantedFormat)&&r.format===wantedFormat),Number(Boolean(profile.city)&&lower(r.city??'')===lower(profile.city)),Number(Boolean(profile.country)&&r.country===profile.country)];
  eligible.sort((a,b)=>{const ar=rank(a),br=rank(b);for(let i=0;i<ar.length;i++){const diff=br[i]!-ar[i]!;if(diff)return diff;}return a.name.localeCompare(b.name,'en')||a.id.localeCompare(b.id);});
  const pageSize=20,start=f.page*pageSize;
  return {results:eligible.slice(start,start+pageSize).map((r):DiscoveryResult=>({id:r.id,kind:r.kind,name:r.name,label:r.kind==='OFFICIAL_SANDAR'?'Official Sandar Space':'Partner Community',purpose:r.purpose,topics:r.topics??[],participation:r.participation??[],format:r.format??null,country:r.country??null,city:r.city??null,developmentSample:r.development_sample})),nextPage:start+pageSize<eligible.length?f.page+1:null,hasPartners:rows.some(r=>r.kind==='PARTNER_COMMUNITY'),personalized:eligible.some(r=>rank(r).slice(1).some(Boolean))};
 }));
 app.post('/v1/discovery/analytics',req=>run(req,async tx=>{const v=discoveryAnalytics.parse(req.body);await tx.query('INSERT INTO discovery_analytics(id,event,result_type,has_search,has_location_filter,result_count_bucket,topics,participation,format,entity_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),v.event,v.resultType??null,v.hasSearch??null,v.hasLocationFilter??null,v.resultCountBucket??null,v.topics??[],v.participation??[],v.format??null,v.type??null]);return {recorded:true};}));
}
