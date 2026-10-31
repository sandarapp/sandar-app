import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Transaction} from '../../../../packages/database/src/database.js';
import * as schema from '../../../../packages/contracts/src/member.js';
import {ApiError} from '../core/errors.js';
import {SecretBox} from '../core/encryption.js';
import {rateLimit} from '../core/rate-limit.js';
import {memberRequest,type Member} from '../core/member-request.js';
import {DevelopmentSafetyClassifier,type SafetyClassifier} from '../spaces/safety.js';
import {contentLocale} from '../spaces/routes.js';

const fail=(status:number,code:string)=>new ApiError(status,code,'This action is not available.');
const today="(now() AT TIME ZONE 'Asia/Jakarta')::date";
const LOW=['LOW','REALLY_HARD'];
const LOW_RUN=5;

// Things a member keeps for themselves: mood check-ins are sealed, never leave
// this account, and aren't used for suggestions, ads or moderation.
export function addMemberExtras(app:FastifyInstance,db:Database,options:{encryptionKey:string;safety?:SafetyClassifier}){
 const box=new SecretBox(options.encryptionKey),safety=options.safety??new DevelopmentSafetyClassifier();
 const run=<T>(req:FastifyRequest,limit:number,work:(tx:Transaction,member:Member)=>Promise<T>)=>memberRequest(db,req,{write:req.method!=='GET',
  onboardingError:()=>fail(403,'ONBOARDING_REQUIRED'),
  before:req.method!=='GET'?async member=>{await rateLimit(db,`member-extras:${member.id}:${req.routeOptions.url}`,limit,3600);}:undefined},work);
 const opened=(userId:string,r:{day:string;sealed:string}):schema.MoodDay=>({day:r.day,...(box.open(r.sealed,`mood:${userId}:${r.day}`) as {mood:schema.Mood;words:string[]})});
 async function screen(text:string){
  const result=await safety.classify(text);
  if(result.reasons.includes('SELF_HARM_LANGUAGE'))throw new ApiError(422,'SELF_HARM_SUPPORT','Tulisan ini tidak dikirim. Kalau kamu sedang dalam bahaya, hubungi 119 ext. 8 atau Healing119.id.');
 }

 async function moodState(tx:Transaction,userId:string):Promise<schema.MoodState>{
  const enabled=Boolean((await tx.query('SELECT mood_check_enabled FROM member_profiles WHERE user_id=$1',[userId])).rows[0]?.mood_check_enabled);
  const days=(await tx.query(`SELECT d::date::text AS day FROM generate_series(${today}-6,${today},interval '1 day') d ORDER BY d`)).rows.map(r=>r.day as string);
  const rows=(await tx.query(`SELECT day::text,sealed FROM mood_checkins WHERE user_id=$1 AND day>${today}-7`,[userId])).rows.map(r=>opened(userId,r));
  const week:schema.MoodDay[]=days.map(day=>rows.find(r=>r.day===day)??{day,mood:null,words:[]});
  const last=week.slice(-LOW_RUN);
  return {enabled,today:rows.find(r=>r.day===days.at(-1))??null,week,lowDays:last.every(d=>d.mood&&LOW.includes(d.mood))?LOW_RUN:0};
 }
 app.get('/v1/mood',req=>run(req,0,(tx,m)=>moodState(tx,m.id)));
 app.post('/v1/mood',req=>run(req,60,async(tx,m)=>{
  const v=schema.moodInput.parse(req.body);
  const day=(await tx.query(`SELECT ${today}::text AS day`)).rows[0].day as string;
  await tx.query('INSERT INTO mood_checkins(user_id,day,sealed) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET sealed=$3,updated_at=now()',[m.id,day,box.seal(v,`mood:${m.id}:${day}`)]);
  return moodState(tx,m.id);
 }));
 app.patch('/v1/mood/settings',req=>run(req,60,async(tx,m)=>{
  const v=schema.moodSettings.parse(req.body);
  await tx.query('UPDATE member_profiles SET mood_check_enabled=$2 WHERE user_id=$1',[m.id,v.enabled]);
  return moodState(tx,m.id);
 }));
 app.get('/v1/mood/export',req=>run(req,0,async(tx,m)=>(await tx.query('SELECT day::text,sealed FROM mood_checkins WHERE user_id=$1 ORDER BY day',[m.id])).rows.map(r=>opened(m.id,r))));
 // The member's own request, so this removes the rows for good.
 app.delete('/v1/mood',req=>run(req,20,async(tx,m)=>{await tx.query('DELETE FROM mood_checkins WHERE user_id=$1',[m.id]);return moodState(tx,m.id);}));

 app.post('/v1/feedback',req=>run(req,20,async(tx,m)=>{
  const v=schema.feedbackInput.parse(req.body);
  if(v.body)await screen(v.body);
  const device=/Mobi|Android|iPhone/i.test(String(req.headers['user-agent']??''))?'PHONE':'DESKTOP';
  await tx.query('INSERT INTO member_feedback(id,user_id,kind,page,moment,body,contact_ok,device) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),m.id,v.kind,v.page??null,v.moment??null,v.body||null,v.contactOk,device]);
  return {received:true};
 }));

 app.get('/v1/interest/events',req=>run(req,0,async(tx,m)=>({interested:Boolean((await tx.query('SELECT 1 FROM event_interest WHERE user_id=$1',[m.id])).rowCount)})));
 app.post('/v1/interest/events',req=>run(req,20,async(tx,m)=>{await tx.query('INSERT INTO event_interest(user_id) VALUES($1) ON CONFLICT DO NOTHING',[m.id]);return {interested:true};}));

 // Who replied and where, never the text. Blocks hide replies either way.
 app.get('/v1/notifications',req=>run(req,0,async(tx,m):Promise<schema.MemberNotification[]>=>{
  const seen=(await tx.query('SELECT notifications_seen_at FROM member_profiles WHERE user_id=$1',[m.id])).rows[0]?.notifications_seen_at as Date|null;
  const rows=(await tx.query(`SELECT * FROM (
    SELECT c.id,'REPLY' AS kind,s.id AS space_id,s.name AS space_name,mp.display_name AS actor,NULL AS status,c.created_at AS at
    FROM space_comments c JOIN space_posts p ON p.id=c.post_id JOIN support_spaces s ON s.id=p.space_id JOIN member_profiles mp ON mp.user_id=c.author_user_id
    WHERE p.author_user_id=$1 AND c.author_user_id<>$1 AND c.status='VISIBLE' AND p.status='VISIBLE'
     AND NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_user_id=$1 AND b.blocked_user_id=c.author_user_id) OR (b.blocked_user_id=$1 AND b.blocker_user_id=c.author_user_id))
    UNION ALL
    SELECT a.id,'SPACE_REVIEWED',s.id,s.name,NULL,s.status,a.created_at
    FROM moderation_actions a JOIN support_spaces s ON s.id=a.space_id WHERE s.host_user_id=$1
   ) n ORDER BY at DESC LIMIT 30`,[m.id])).rows;
  return rows.map(r=>({id:r.id,kind:r.kind,spaceId:r.space_id,spaceName:r.space_name,actor:r.actor,status:r.status,at:r.at.toISOString(),unread:!seen||r.at>seen}));
 }));
 app.post('/v1/notifications/seen',req=>run(req,240,async(tx,m)=>{await tx.query('UPDATE member_profiles SET notifications_seen_at=now() WHERE user_id=$1',[m.id]);return {seen:true};}));

 // Previews follow the same rules as the feed: visible posts only, blocks hide them
 // either way, and an anonymous post's author never leaves the database.
 app.get('/v1/spaces/mine',req=>run(req,0,async(tx,m):Promise<schema.MySpace[]>=>{
  const blocked="NOT EXISTS(SELECT 1 FROM member_blocks b WHERE (b.blocker_user_id=$1 AND b.blocked_user_id=p.author_user_id) OR (b.blocked_user_id=$1 AND b.blocker_user_id=p.author_user_id))";
  const rows=(await tx.query(`SELECT s.id,COALESCE(t.name,s.name) AS name,s.kind,s.status,s.host_user_id IS NOT DISTINCT FROM $1 AS hosted,COALESCE(x.status='JOINED',false) AS joined,
    (SELECT count(*)::int FROM space_memberships mm WHERE mm.space_id=s.id AND mm.status='JOINED') AS members,
    CASE WHEN x.status='JOINED' THEN (SELECT count(*)::int FROM space_posts p WHERE p.space_id=s.id AND p.status='VISIBLE' AND p.created_at>COALESCE(x.last_read_at,x.joined_at) AND p.author_user_id IS DISTINCT FROM $1 AND ${blocked}) ELSE 0 END AS new_posts,
    l.body,l.identity_mode,l.author,l.created_at AS last_post
   FROM support_spaces s LEFT JOIN space_memberships x ON x.space_id=s.id AND x.user_id=$1 LEFT JOIN support_space_translations t ON t.space_id=s.id AND t.locale=$2
   LEFT JOIN LATERAL (SELECT COALESCE(tr.body,p.body) AS body,p.identity_mode,CASE WHEN p.identity_mode='PROFILE' THEN mp.display_name END AS author,p.created_at
     FROM space_posts p LEFT JOIN member_profiles mp ON mp.user_id=p.author_user_id LEFT JOIN space_post_translations tr ON tr.post_id=p.id AND tr.locale=$2
     WHERE p.space_id=s.id AND p.status='VISIBLE' AND ${blocked} ORDER BY p.created_at DESC LIMIT 1) l ON true
   WHERE (x.status='JOINED' AND s.status IN ('ACTIVE','RESTRICTED')) OR s.host_user_id=$1
   ORDER BY s.host_user_id IS NOT DISTINCT FROM $1 DESC,l.created_at DESC NULLS LAST,s.name LIMIT 50`,[m.id,contentLocale(req)])).rows;
  return rows.map(r=>({id:r.id,name:r.name,kind:r.kind,status:r.status,hosted:r.hosted,joined:r.joined,memberCount:r.members,newCount:r.new_posts,lastPostAt:r.last_post?.toISOString()??null,
   preview:r.body?{body:r.body.slice(0,160),identityMode:r.identity_mode,authorName:r.author}:null}));
 }));

 // A member's own view: anonymous posts appear here and nowhere else as theirs.
 app.get('/v1/me/profile',req=>run(req,0,async(tx,m):Promise<schema.MemberProfile>=>{
  const p=(await tx.query('SELECT mp.bio,u.created_at FROM member_profiles mp JOIN users u ON u.id=mp.user_id WHERE mp.user_id=$1',[m.id])).rows[0];
  const spaces=(await tx.query("SELECT s.id,s.name FROM support_spaces s JOIN space_memberships x ON x.space_id=s.id WHERE x.user_id=$1 AND x.status='JOINED' AND s.status='ACTIVE' ORDER BY s.name",[m.id])).rows;
  const posts=(await tx.query(`SELECT p.id,p.body,p.identity_mode,p.space_id,s.name AS space_name,p.created_at,(SELECT count(*)::int FROM space_comments c WHERE c.post_id=p.id AND c.status='VISIBLE') AS comments
   FROM space_posts p JOIN support_spaces s ON s.id=p.space_id WHERE p.author_user_id=$1 AND p.status='VISIBLE' ORDER BY p.created_at DESC LIMIT 30`,[m.id])).rows;
  return {displayName:m.displayName,bio:p.bio??'',joinedAt:p.created_at.toISOString(),spaces,posts:posts.map(x=>({id:x.id,body:x.body,identityMode:x.identity_mode,spaceId:x.space_id,spaceName:x.space_name,createdAt:x.created_at.toISOString(),commentCount:x.comments}))};
 }));
 app.patch('/v1/me/profile',req=>run(req,60,async(tx,m)=>{
  const v=schema.profileInput.parse(req.body);
  if(v.bio)await screen(v.bio);
  await tx.query('UPDATE member_profiles SET bio=$2 WHERE user_id=$1',[m.id,v.bio||null]);
  return {bio:v.bio};
 }));
}
