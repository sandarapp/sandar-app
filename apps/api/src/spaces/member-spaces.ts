import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import {uuid} from '../../../../packages/contracts/src/spaces.js';
import {memberSpaceGuidelines,memberSpaceInput,memberSpaceLimit,type MemberSpaceSummary} from '../../../../packages/contracts/src/member-spaces.js';
import {ApiError} from '../core/errors.js';
import {rateLimit} from '../core/rate-limit.js';
import {memberRequest} from '../core/member-request.js';
import {DevelopmentSafetyClassifier,type SafetyClassifier} from './safety.js';

// Spaces started by members. Nothing is listed until a moderator approves it.
const nameLooksWrong=/@|https?:|www\.|\.(com|id|net|org)\b|\d{7}|\b(sandar|admin|moderator|official|resmi|psikolog|psikiater|dokter|staff|staf)\b/i;
const fail=(status:number,code:string)=>new ApiError(status,code,'This action is not available.');
const open="status IN ('IN_REVIEW','NEEDS_CHANGES')";

export function addMemberSpaces(app:FastifyInstance,db:Database,safety:SafetyClassifier=new DevelopmentSafetyClassifier()){
 const run=(req:FastifyRequest,work:(tx:Transaction,userId:string,name:string)=>Promise<unknown>)=>memberRequest(db,req,{write:req.method!=='GET',
  onboardingError:()=>fail(403,'ONBOARDING_REQUIRED'),
  before:req.method!=='GET'?async member=>{await rateLimit(db,`member-space:${member.id}`,20,3600);}:undefined},(tx,member)=>work(tx,member.id,member.displayName));
 async function screen(tx:Transaction,v:{name:string;purpose:string;rules:string[]},except:string|null){
  if(nameLooksWrong.test(v.name))throw fail(422,'SPACE_NAME_NOT_ALLOWED');
  const result=await safety.classify([v.name,v.purpose,...v.rules].join('\n'));
  if(result.reasons.includes('SELF_HARM_LANGUAGE'))throw new ApiError(422,'SELF_HARM_SUPPORT','Tulisan ini tidak dipublikasikan. Kalau kamu sedang dalam bahaya, hubungi 119 ext. 8 atau Healing119.id.');
  if(['BLOCK','REQUIRE_EDIT'].includes(result.requiredAction))throw fail(422,'CONTENT_REQUIRES_EDIT');
  const taken=await tx.query("SELECT 1 FROM support_spaces s LEFT JOIN support_space_translations t ON t.space_id=s.id WHERE s.status<>'NOT_APPROVED' AND (lower(s.name)=lower($1) OR lower(t.name)=lower($1)) AND s.id IS DISTINCT FROM $2",[v.name,except]);
  if(taken.rowCount)throw fail(409,'SPACE_NAME_TAKEN');
 }
 app.get('/v1/member-spaces/mine',req=>run(req,async(tx,userId):Promise<MemberSpaceSummary[]>=>
  (await tx.query('SELECT id,name,status,review_note FROM support_spaces WHERE host_user_id=$1 ORDER BY created_at DESC LIMIT 20',[userId])).rows.map(r=>({id:r.id,name:r.name,status:r.status,reviewNote:r.review_note}))));
 app.post('/v1/member-spaces',req=>run(req,async(tx,userId,displayName)=>{
  const v=memberSpaceInput.parse(req.body);
  const earlier=(await tx.query('SELECT id FROM support_spaces WHERE host_user_id=$1 AND request_id=$2',[userId,v.requestId])).rows[0];
  if(earlier)return {id:earlier.id,status:'IN_REVIEW'};
  const mine=(await tx.query(`SELECT count(*) FILTER(WHERE ${open})::int AS waiting,count(*) FILTER(WHERE ${open} OR status='ACTIVE')::int AS hosted FROM support_spaces WHERE host_user_id=$1`,[userId])).rows[0];
  if(mine.waiting>0)throw fail(409,'SPACE_ALREADY_IN_REVIEW');
  if(mine.hosted>=memberSpaceLimit)throw fail(409,'SPACE_LIMIT_REACHED');
  await screen(tx,v,null);
  const id=randomUUID();
  await tx.query(`INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,posting_enabled,commenting_enabled,anonymous_allowed,development_sample,host_user_id,topics,rules,request_id)
   VALUES($1,'MEMBER_SPACE',$2,$3,'18+',$4,$5,'IN_REVIEW',$6,true,true,$7,false,$8,$9,$10,$11)`,[id,v.name,v.purpose,v.topics[0],displayName,memberSpaceGuidelines,v.anonymousAllowed,userId,v.topics,v.rules,v.requestId]);
  return {id,status:'IN_REVIEW'};
 }));
 // Only a space sent back for changes can be edited; sending it again returns it to review.
 app.patch('/v1/member-spaces/:id',req=>run(req,async(tx,userId)=>{
  const v=memberSpaceInput.parse(req.body),id=uuid.parse((req.params as Record<string,string>).id);
  const row=(await tx.query('SELECT status FROM support_spaces WHERE id=$1 AND host_user_id=$2 FOR UPDATE',[id,userId])).rows[0];
  if(!row)throw fail(404,'NOT_FOUND');
  if(row.status!=='NEEDS_CHANGES')throw fail(409,'SPACE_NOT_EDITABLE');
  await screen(tx,v,id);
  await tx.query("UPDATE support_spaces SET name=$2,purpose=$3,topic=$4,topics=$5,rules=$6,anonymous_allowed=$7,status='IN_REVIEW',review_note=NULL,updated_at=now() WHERE id=$1",[id,v.name,v.purpose,v.topics[0],v.topics,v.rules,v.anonymousAllowed]);
  return {id,status:'IN_REVIEW'};
 }));
}
