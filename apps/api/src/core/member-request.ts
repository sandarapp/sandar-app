import type {FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import {transaction} from '../../../../packages/database/src/database.js';
import {token} from '../../../../packages/contracts/src/auth.js';
import type {User} from '../../../../packages/contracts/src/auth.js';
import {digest} from '../auth/crypto.js';
import {authorize} from '../auth/authorization.js';
import {ApiError,invalidSession} from './errors.js';

// One place for the member request preamble used by Spaces, Home and Discovery.
// Each database round trip is expensive when the app and database are far
// apart, so the session, account and onboarding checks are one query, reads
// skip the transaction, and only writes take the shared lock.
export interface Member {id:string;displayName:string}
export interface MemberRequestOptions {
 write:boolean;
 onboardingError:()=>ApiError;
 // Runs after the member is known, before the work (rate limits, events).
 before?:(member:Member)=>Promise<void>;
}

async function memberFor(executor:Pick<Transaction,'query'>,accessToken:string,onboardingError:()=>ApiError):Promise<Member>{
 const row=(await executor.query<User&{display_name:string|null;onboarding_completed_at:Date|null}>(`
  SELECT u.*,mp.display_name,mp.onboarding_completed_at FROM sessions s JOIN users u ON u.id=s.user_id
  LEFT JOIN member_profiles mp ON mp.user_id=u.id
  WHERE s.access_hash=$1 AND s.revoked_at IS NULL AND s.access_expires_at>now() AND s.expires_at>now()`,[digest(accessToken)])).rows[0];
 if(!row)throw invalidSession();
 authorize(row,'self:read');authorize(row,'member:participate');
 if(!row.onboarding_completed_at)throw onboardingError();
 return {id:row.id,displayName:row.display_name??'Member'};
}

export async function memberRequest<T>(db:Database,request:FastifyRequest,options:MemberRequestOptions,work:(tx:Transaction,member:Member)=>Promise<T>){
 const header=request.headers.authorization??'';
 const parsed=token.safeParse(header.startsWith('Bearer ')?header.slice(7):'');if(!parsed.success)throw invalidSession();
 if(options.write)return transaction(db,async tx=>{
  // One lock order for participation mutations avoids block/join races in this MVP.
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('sandar-spaces-v1'))");
  const member=await memberFor(tx,parsed.data,options.onboardingError);
  await options.before?.(member);
  return {data:await work(tx,member),error:null};
 });
 const client=await db.connect();
 try{
  const member=await memberFor(client,parsed.data,options.onboardingError);
  await options.before?.(member);
  return {data:await work(client,member),error:null};
 }finally{client.release();}
}
