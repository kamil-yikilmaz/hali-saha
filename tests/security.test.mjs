import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const A='10000000-0000-0000-0000-000000000001',P='10000000-0000-0000-0000-000000000002',Q='10000000-0000-0000-0000-000000000003';
const SA='20000000-0000-0000-0000-000000000001',SP='20000000-0000-0000-0000-000000000002',SQ='20000000-0000-0000-0000-000000000003';
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table auth.mfa_factors(user_id uuid,status text);
 create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;
 create table public.players(id uuid primary key,username text,pass_hash text,mevki text,is_admin boolean,oylama_kilidi timestamptz,created_at timestamptz);
 create table public.votes(id uuid primary key default gen_random_uuid(),voter_id uuid,target_id uuid,score int,comment text,updated_at timestamptz);
 create table public.app_config(id text,voting_open boolean);
 create view public.player_results as select username from public.players;
 create view public.anonymous_comments as select comment from public.votes;
 grant all on all tables in schema public to anon,authenticated;
 alter table public.players enable row level security;
 create policy unsafe on public.players for all to public using(true);
 insert into public.players values('${A}','Admin','legacy-test-only',null,true,null,now()),('${P}','Oyuncu A','legacy-test-only','Defans',false,null,now()),('${Q}','Oyuncu B','legacy-test-only','Forvet',false,null,now());
 insert into auth.users values('${A}','admin@example.test',now(),null),('${P}','p@example.test',now(),null),('${Q}','q@example.test',now(),null);
 insert into auth.sessions values('${SA}','${A}',null),('${SP}','${P}',null),('${SQ}','${Q}',null);`);
 for(const f of ['202609220001_lockdown.sql','202609220002_secure_api.sql','202609220003_player_credentials.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.exec(`insert into app_private.account_links(auth_id,player_id) values('${A}','${A}'),('${P}','${P}'),('${Q}','${Q}');`);
});
after(()=>db.close());
async function api(uid,session,payload,{mfa=false,age=0}={}){
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,session_id:session,aal:mfa?'aal2':'aal1',amr:mfa?[{method:'totp',timestamp:Math.floor(Date.now()/1000)-age}]:[]})]);
 await db.exec('set role authenticated');
 try{return (await db.query('select public.secure_api($1::jsonb) r',[JSON.stringify(payload)])).rows[0].r;}finally{await db.exec('reset role');}
}
test('table access and helper execution denied to both browser roles',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  for(const table of ['players','votes','app_config','player_results','anonymous_comments'])await assert.rejects(db.query('select * from public.'+table+' limit 0'),/permission denied/);
  await assert.rejects(db.query("select app_private.snapshot('{}','x')"),/permission denied/);
  if(role==='anon')await assert.rejects(db.query("select public.secure_api('{}')"),/permission denied/);
  await db.exec('reset role');
 }
});
test('migration removes credential material from active state and closes voting',async()=>{
 const s=(await db.query('select data from app_private.state')).rows[0].data;
 assert.equal(JSON.stringify(s).includes('legacy-test-only'),false);assert.equal(s.config.votingOpen,false);
 assert.equal(Object.keys(s.members).length,3);
});
test('missing and revoked sessions rejected',async()=>{
 assert.equal((await api(P,SQ,{action:'read'})).error,'UNAUTHENTICATED');
 assert.equal((await api(null,null,{action:'read'})).error,'UNAUTHENTICATED');
});
test('administrator requires actual fresh MFA; forged payload role has no effect',async()=>{
 assert.equal((await api(A,SA,{action:'read'})).error,'MFA_REQUIRED');
 assert.equal((await api(P,SP,{action:'toggle',open:true,role:'admin',actor:A})).error,'FORBIDDEN');
 assert.equal((await api(A,SA,{action:'toggle',open:true},{mfa:true,age:601})).error,'MFA_REQUIRED');
 assert.equal((await api(A,SA,{action:'toggle',open:true},{mfa:true})).open,true);
});
test('player snapshot omits other votes, members and early results',async()=>{
 const r=await api(P,SP,{action:'read'});assert.equal(r.results,null);assert.equal(r.votes,undefined);assert.equal(r.members,undefined);
});
test('vote constraints and complete-ballot requirement are server enforced',async()=>{
 assert.equal((await api(P,SP,{action:'finalize'})).error,'INCOMPLETE_BALLOT');
 assert.equal((await api(P,SP,{action:'vote',target:P,puan:7,aciklama:''})).error,'FORBIDDEN');
 for(const puan of [0,11,1.2,'8',null])assert.equal((await api(P,SP,{action:'vote',target:Q,puan,aciklama:''})).error,'INVALID_INPUT');
 assert.equal((await api(P,SP,{action:'vote',target:Q,puan:8,aciklama:'x'.repeat(501)})).error,'INVALID_INPUT');
 const r=await api(P,SP,{action:'vote',target:Q,puan:8,aciklama:'İyi oyun'});assert.equal(r.myVotes[Q].puan,8);
 assert.equal((await api(P,SP,{action:'position',mevki:'Kaleci'})).error,'ROSTER_FROZEN');
});
test('finalization and global closure prohibit later changes; comment is anonymous',async()=>{
 let r=await api(P,SP,{action:'finalize'});assert.equal(r.me.locked,true);assert.equal(r.results.find(x=>x.uid===Q).avg,8);
 assert.equal((await api(P,SP,{action:'vote',target:Q,puan:9,aciklama:''})).error,'VOTING_LOCKED');
 await api(A,SA,{action:'toggle',open:false},{mfa:true});
 assert.equal((await api(Q,SQ,{action:'vote',target:P,puan:5,aciklama:''})).error,'VOTING_LOCKED');
 r=await api(Q,SQ,{action:'read'});assert.deepEqual(r.comments,[{puan:8,aciklama:'İyi oyun'}]);
});
test('new round archives old votes instead of destroying history',async()=>{
 const r=await api(A,SA,{action:'resetAll',confirm:'YENI OYLAMA'},{mfa:true});assert.deepEqual(r.votes,{});
 const a=(await db.query('select data from app_private.archives order by id desc limit 1')).rows[0].data;assert.equal(a.votes[P][Q].puan,8);
});
test('failed operations still count against rate limit',async()=>{
 await db.query("update app_private.rate_limits set count=59,bucket=date_trunc('minute',now()) where auth_id=$1",[P]);
 assert.equal((await api(P,SP,{action:'unknown'})).error,'INVALID_ACTION');
 assert.equal((await api(P,SP,{action:'read'})).error,'RATE_LIMITED');
});
test('unlinked users and disabled members are denied',async()=>{
 await db.query('delete from app_private.account_links where auth_id=$1',[Q]);
 assert.equal((await api(Q,SQ,{action:'read'})).error,'MEMBERSHIP_REQUIRED');
 await api(A,SA,{action:'deactivate',target:P},{mfa:true});
 await db.query('delete from app_private.rate_limits where auth_id=$1',[P]);
 assert.equal((await api(P,SP,{action:'read'})).error,'FORBIDDEN');
});
test('player_api supports username login, default 123 password detection, and password change',async()=>{
 const hash123='a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
 const newHash='b665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae4';
 const errLogin=(await db.query('select public.player_api($1::jsonb) r',[JSON.stringify({action:'login',username:'Oyuncu B',pass_hash:'wrong'})])).rows[0].r;
 assert.equal(errLogin.error,'INVALID_PASSWORD');
 const loginRes=(await db.query('select public.player_api($1::jsonb) r',[JSON.stringify({action:'login',username:'Oyuncu B',pass_hash:hash123})])).rows[0].r;
 assert.equal(loginRes.me.username,'Oyuncu B');
 assert.equal(loginRes.me.is_default_password,true);
 const chRes=(await db.query('select public.player_api($1::jsonb) r',[JSON.stringify({action:'change_password',username:'Oyuncu B',pass_hash:hash123,new_pass_hash:newHash})])).rows[0].r;
 assert.equal(chRes.me.is_default_password,false);
 const oldRejected=(await db.query('select public.player_api($1::jsonb) r',[JSON.stringify({action:'login',username:'Oyuncu B',pass_hash:hash123})])).rows[0].r;
 assert.equal(oldRejected.error,'INVALID_PASSWORD');
 const newAccepted=(await db.query('select public.player_api($1::jsonb) r',[JSON.stringify({action:'login',username:'Oyuncu B',pass_hash:newHash})])).rows[0].r;
 assert.equal(newAccepted.me.is_default_password,false);
});
