import {Pool,transaction} from '../packages/database/src/database.js';
if(process.env.NODE_ENV!=='development')throw new Error('Spaces seed is development-only');
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/sandar')throw new Error('Seed requires the local sandar development database');
const db=new Pool({connectionString:url.toString()});
const fixtures=[
 ['Work Stress & Burnout','A space to share experiences, find perspective, and feel less alone.','People navigating work stress, burnout, and balancing life and work.','Work & life'],
 ['Feeling Overwhelmed','A space to slow down, share what is heavy, and find support.','Adults looking for a kind place to pause and feel heard.','Everyday support'],
 ['Loneliness & Connection','A space to find connection and meaningful conversations.','Adults seeking respectful conversation and a sense of belonging.','Connection'],
 ['Life Changes','A space to talk through change, at your own pace.','Adults navigating transitions in work, relationships, or everyday life.','Life transitions'],
 ['General Support','A welcoming space for everyday experiences and peer support.','Adults who want to read quietly, listen, or share an experience.','General support']
];
try{await transaction(db,async tx=>{
 for(const [i,[name,purpose,audience,topic]] of fixtures.entries())await tx.query(`INSERT INTO support_spaces(id,kind,name,purpose,audience,topic,operator_name,status,guidelines_version,development_sample) VALUES($1,'OFFICIAL_SANDAR',$2,$3,$4,$5,'Sandar','ACTIVE','dev-spaces-v1',true) ON CONFLICT(id) DO NOTHING`,[`f0100000-0000-4000-8000-00000000000${i+1}`,name,purpose,audience,topic]);
 for(const [i,topics] of [['BURNOUT','WORK_PRESSURE'],['OVERWHELMED'],['LONELINESS'],['LIFE_CHANGES'],['GENERAL_SUPPORT']].entries())await tx.query(`INSERT INTO discovery_profiles(space_id,published,topics,participation,format) VALUES($1,true,$2,ARRAY['READ_QUIETLY','SHARE_EXPERIENCES'],'ONLINE') ON CONFLICT(space_id) DO NOTHING`,[`f0100000-0000-4000-8000-00000000000${i+1}`,topics]);
});console.log('Five development sample Official Sandar Spaces ready. No members, activity, or moderation staffing fabricated.');}finally{await db.end();}
