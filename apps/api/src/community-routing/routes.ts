import type {FastifyInstance} from 'fastify';
import type {Database} from '../../../../packages/database/src/database.js';
import type {AuthService} from '../auth/service.js';
import {authorize} from '../auth/authorization.js';
import {token} from '../../../../packages/contracts/src/auth.js';
import {invalidSession} from '../core/errors.js';
export function addCommunityRouting(app:FastifyInstance,db:Database,auth:AuthService){
 app.get('/v1/community-applications/me',async request=>{
  const parsed=token.safeParse(request.headers.authorization?.startsWith('Bearer ')?request.headers.authorization.slice(7):'');
  if(!parsed.success)throw invalidSession();
  const user=await auth.authenticate(parsed.data);authorize(user,'community:apply');
  const row=(await db.query('SELECT status,updated_at FROM community_application_states WHERE user_id=$1',[user.id])).rows[0];
  return {data:{status:row?.status??'DRAFT',capabilities:{applicationEditing:false,portal:false}},error:null};
 });
}
