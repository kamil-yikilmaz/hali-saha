begin;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
alter default privileges in schema app_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from public, anon, authenticated;
create table if not exists app_private.state (
 id boolean primary key default true check(id), data jsonb not null,
 updated_at timestamptz not null default now()
);
create table if not exists app_private.account_links (
 auth_id uuid primary key references auth.users(id) on delete cascade,
 player_id text not null unique, created_at timestamptz not null default now()
);
create table if not exists app_private.rate_limits (
 auth_id uuid primary key references auth.users(id) on delete cascade,
 bucket timestamptz not null, count integer not null
);
create table if not exists app_private.archives (
 id bigint generated always as identity primary key, data jsonb not null,
 actor uuid, created_at timestamptz not null default now()
);
create table if not exists app_private.audit (
 id bigint generated always as identity primary key, actor text, action text not null,
 target text, at timestamptz not null default now()
);
alter table app_private.state enable row level security;
alter table app_private.account_links enable row level security;
alter table app_private.rate_limits enable row level security;
alter table app_private.archives enable row level security;
alter table app_private.audit enable row level security;
revoke all on all tables in schema app_private from public, anon, authenticated;
-- Migration is idempotent. Originals remain locked and untouched, including invalid legacy records.
do $$ declare s jsonb; members jsonb; votes jsonb; locks jsonb; begin
 if not exists(select 1 from app_private.state) then
 select coalesce(jsonb_object_agg(id::text,jsonb_build_object('username',username,'mevki',mevki,
   'role',case when is_admin then 'admin' else 'player' end,'player',not is_admin,'active',true)), '{}'::jsonb)
 into members from public.players;
 select coalesce(jsonb_object_agg(voter_id,items),'{}'::jsonb) into votes from (
  select v.voter_id::text, jsonb_object_agg(v.target_id::text,jsonb_build_object('puan',v.score,
    'aciklama',coalesce(v.comment,''),'ts',extract(epoch from v.updated_at)*1000)) items
  from public.votes v join public.players a on a.id=v.voter_id join public.players b on b.id=v.target_id
  where v.score between 1 and 10 and v.voter_id<>v.target_id and not a.is_admin and not b.is_admin
    and char_length(coalesce(v.comment,''))<=500 group by v.voter_id
 ) x;
 select coalesce(jsonb_object_agg(id::text,extract(epoch from oylama_kilidi)*1000),'{}'::jsonb)
 into locks from public.players where oylama_kilidi is not null;
 s:=jsonb_build_object('members',members,'votes',votes,'locked',locks,'config',
   jsonb_build_object('votingOpen',false,'started',votes<>'{}'::jsonb));
 insert into app_private.state(id,data) values(true,s);
 insert into app_private.archives(data) values(s);
 end if;
end $$;

create or replace function app_private.snapshot(s jsonb, actor text) returns jsonb
language plpgsql set search_path = pg_catalog as $$
declare me jsonb:=s->'members'->actor; admin boolean:=(me->>'role'='admin');
 players jsonb; result_rows jsonb; comments jsonb:='[]'; total integer; done integer; out jsonb; visible boolean;
begin
 select coalesce(jsonb_agg(jsonb_build_object('uid',key,'username',value->>'username','mevki',value->>'mevki') order by value->>'username'),'[]'),count(*)
 into players,total from jsonb_each(s->'members') where value->>'active'='true' and value->>'player'='true';
 select count(*) into done from jsonb_each(s->'votes') f cross join lateral jsonb_each(f.value) t
 where s->'members'->f.key->>'active'='true' and s->'members'->t.key->>'active'='true'
 and s->'members'->f.key->>'player'='true' and s->'members'->t.key->>'player'='true';
 visible:=admin or (s->'locked' ? actor) or s->'config'->>'votingOpen'='false';
 if visible then
 with roster as (select key uid,value m from jsonb_each(s->'members') where value->>'active'='true' and value->>'player'='true'),
 scores as (select t.key uid,(t.value->>'puan')::int score from jsonb_each(s->'votes') f
 cross join lateral jsonb_each(f.value) t join roster r on r.uid=f.key where f.key<>t.key),
 aggregates as (select r.uid,r.m->>'username' username,r.m->>'mevki' mevki,count(v.score)::int count,
 coalesce(sum(v.score),0)::int sum,avg(v.score) avg,min(v.score) min,max(v.score) max
 from roster r left join scores v on v.uid=r.uid group by r.uid,r.m),
 ranked as (select *,case when avg is not null then rank() over(order by avg desc nulls last) end rank from aggregates)
 select coalesce(jsonb_agg(to_jsonb(ranked)||jsonb_build_object('expected',greatest(total-1,0)) order by avg desc nulls last,username),'[]') into result_rows from ranked;
 select coalesce(jsonb_agg(jsonb_build_object('puan',value->actor->'puan','aciklama',value->actor->>'aciklama') order by (value->actor->>'puan')::int),'[]')
 into comments from jsonb_each(s->'votes') where coalesce(value->actor->>'aciklama','')<>'';
 end if;
 out:=jsonb_build_object('me',me||jsonb_build_object('uid',actor,'locked',s->'locked'?actor),'open',s->'config'->'votingOpen',
 'players',players,'myVotes',coalesce(s->'votes'->actor,'{}'),'progress',jsonb_build_object('done',done,'expected',total*greatest(total-1,0)),
 'results',result_rows,'comments',comments);
 if admin then
 out:=out||jsonb_build_object('members',(select coalesce(jsonb_agg(value||jsonb_build_object('uid',key,'locked',s->'locked'?key)),'[]') from jsonb_each(s->'members')),
 'votes',s->'votes','audit',(select coalesce(jsonb_agg(x order by x.at desc),'[]') from
 (select a.actor,a.action,a.target,extract(epoch from a.at)*1000 as "at" from app_private.audit a order by a.id desc limit 100) x));
 end if;
 return out;
end $$;

create or replace function app_private.dispatch(actor text, payload jsonb) returns jsonb
language plpgsql set search_path = pg_catalog as $$
declare s jsonb; me jsonb; action text:=payload->>'action'; target text:=payload->>'target';
 score integer; comment text; member jsonb; n integer; now_ms numeric:=extract(epoch from clock_timestamp())*1000;
 auth_target uuid; legacy_id text;
begin
 select data into s from app_private.state where id=true for update;
 me:=s->'members'->actor;
 if me is null or me->>'active' is distinct from 'true' then raise exception 'FORBIDDEN'; end if;
 if me->>'role'='admin' then
 if coalesce(auth.jwt()->>'aal','')<>'aal2' or not exists (
 select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a
 where a->>'method'='totp' and (a->>'timestamp')::numeric >= extract(epoch from now())-case when action='read' then 3600 else 600 end
 ) then raise exception 'MFA_REQUIRED'; end if;
 end if;
 if action in ('member','deactivate','toggle','unlock','resetOne','resetAll','linkAccount') and me->>'role'<>'admin' then raise exception 'FORBIDDEN'; end if;
 case action
 when 'read' then null;
 when 'vote' then
  if me->>'player'<>'true' or target=actor or coalesce(s->'members'->target->>'player','')<>'true' or coalesce(s->'members'->target->>'active','')<>'true' then raise exception 'FORBIDDEN'; end if;
  if s->'config'->>'votingOpen'<>'true' or s->'locked'?actor then raise exception 'VOTING_LOCKED'; end if;
  if jsonb_typeof(payload->'puan') is distinct from 'number' or (payload->>'puan') !~ '^(10|[1-9])$' or jsonb_typeof(payload->'aciklama') is distinct from 'string' or char_length(payload->>'aciklama')>500 then raise exception 'INVALID_INPUT'; end if;
  score:=(payload->>'puan')::int; comment:=btrim(payload->>'aciklama');
  s:=jsonb_set(s,array['votes',actor],coalesce(s->'votes'->actor,'{}')||jsonb_build_object(target,jsonb_build_object('puan',score,'aciklama',comment,'ts',now_ms)));
  s:=jsonb_set(s,'{config,started}','true');
 when 'finalize' then
  if me->>'player'<>'true' or s->'config'->>'votingOpen'<>'true' or s->'locked'?actor then raise exception 'VOTING_LOCKED'; end if;
  select count(*) into n from jsonb_each(s->'members') where value->>'active'='true' and value->>'player'='true';
  if n<2 or exists(select 1 from jsonb_each(s->'members') where key<>actor and value->>'active'='true' and value->>'player'='true' and s->'votes'->actor->key is null) then raise exception 'INCOMPLETE_BALLOT'; end if;
  s:=jsonb_set(s,array['locked',actor],to_jsonb(now_ms));
 when 'position' then
  if me->>'player'<>'true' or s->'config'->>'started'='true' or s->'locked'?actor then raise exception 'ROSTER_FROZEN'; end if;
  if coalesce(payload->>'mevki','') not in ('Kaleci','Defans','Orta Saha','Forvet') then raise exception 'INVALID_INPUT'; end if;
  s:=jsonb_set(s,array['members',actor,'mevki'],payload->'mevki');
 when 'member' then
  if s->'config'->>'started'='true' then raise exception 'ROSTER_FROZEN'; end if;
  target:=coalesce(nullif(target,''),gen_random_uuid()::text);
  if target !~ '^[a-zA-Z0-9_-]{1,128}$' or char_length(btrim(coalesce(payload->>'username','')))=0 or char_length(payload->>'username')>60 or coalesce(payload->>'mevki','') not in ('Kaleci','Defans','Orta Saha','Forvet') then raise exception 'INVALID_INPUT'; end if;
  if s->'members'->target->>'role'='admin' then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from jsonb_each(s->'members') where key<>target and lower(value->>'username')=lower(btrim(payload->>'username'))) then raise exception 'DUPLICATE_MEMBER'; end if;
  select count(*) into n from jsonb_each(s->'members');
  if n>=100 and not (s->'members'?target) then raise exception 'MEMBER_LIMIT'; end if;
  member:=jsonb_build_object('username',btrim(payload->>'username'),'mevki',payload->>'mevki','role','player','player',true,'active',true);
  s:=jsonb_set(s,array['members',target],member);
 when 'deactivate' then
  if s->'config'->>'started'='true' then raise exception 'ROSTER_FROZEN'; end if;
  if coalesce(s->'members'->target->>'role','')<>'player' then raise exception 'INVALID_INPUT'; end if;
  s:=jsonb_set(s,array['members',target,'active'],'false');
 when 'toggle' then
  if jsonb_typeof(payload->'open') is distinct from 'boolean' then raise exception 'INVALID_INPUT'; end if;
  s:=jsonb_set(s,'{config,votingOpen}',payload->'open');
 when 'unlock','resetOne' then
  if coalesce(s->'members'->target->>'player','')<>'true' then raise exception 'INVALID_INPUT'; end if;
  s:=jsonb_set(s,'{locked}',(s->'locked')-target);
  if action='resetOne' then s:=jsonb_set(s,'{votes}',(s->'votes')-target); end if;
 when 'resetAll' then
  if s->'config'->>'votingOpen'<>'false' or payload->>'confirm' is distinct from 'YENI OYLAMA' then raise exception 'CONFIRM_REQUIRED'; end if;
  insert into app_private.archives(data,actor) values(s,auth.uid());
  s:=jsonb_set(jsonb_set(jsonb_set(s,'{votes}','{}'),'{locked}','{}'),'{config,started}','false');
 when 'linkAccount' then
  if coalesce(s->'members'->target->>'active','')<>'true' or s->'members'->target->>'role'='admin' then raise exception 'INVALID_INPUT'; end if;
  select id into auth_target from auth.users where lower(email)=lower(btrim(payload->>'email')) and email_confirmed_at is not null;
  if auth_target is null then raise exception 'ACCOUNT_NOT_VERIFIED'; end if;
  -- No takeover/rebinding through this endpoint. Recovery is a privileged dashboard procedure.
  insert into app_private.account_links(auth_id,player_id) values(auth_target,target);
 else raise exception 'INVALID_ACTION';
 end case;
 if action<>'read' then
 update app_private.state set data=s,updated_at=now() where id=true;
 insert into app_private.audit(actor,action,target) values(actor,action,target);
 end if;
 return app_private.snapshot(s,actor);
end $$;

create or replace function public.secure_api(payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare uid uuid:=auth.uid(); actor text; attempts integer; err text;
begin
 -- Gateway validates JWT. Check current server session too so logout/deletion revokes access.
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and (banned_until is null or banned_until<now()))
 or not exists(select 1 from auth.sessions where id::text=auth.jwt()->>'session_id' and user_id=uid and (not_after is null or not_after>now())) then
 return jsonb_build_object('error','UNAUTHENTICATED'); end if;
 insert into app_private.rate_limits as r(auth_id,bucket,count) values(uid,date_trunc('minute',now()),1)
 on conflict(auth_id) do update set bucket=excluded.bucket,count=case when r.bucket=excluded.bucket then r.count+1 else 1 end returning count into attempts;
 if attempts>60 then return jsonb_build_object('error','RATE_LIMITED'); end if;
 if exists(select 1 from auth.mfa_factors where user_id=uid and status='verified') and coalesce(auth.jwt()->>'aal','')<>'aal2' then return jsonb_build_object('error','MFA_REQUIRED'); end if;
 select player_id into actor from app_private.account_links where auth_id=uid;
 if actor is null then return jsonb_build_object('error','MEMBERSHIP_REQUIRED'); end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8192 then return jsonb_build_object('error','INVALID_INPUT'); end if;
 begin
 return app_private.dispatch(actor,payload);
 exception when others then
 err:=sqlerrm;
 if err not in ('FORBIDDEN','MFA_REQUIRED','VOTING_LOCKED','INVALID_INPUT','INCOMPLETE_BALLOT','ROSTER_FROZEN','DUPLICATE_MEMBER','MEMBER_LIMIT','CONFIRM_REQUIRED','ACCOUNT_NOT_VERIFIED','INVALID_ACTION') then err:='OPERATION_FAILED'; end if;
 return jsonb_build_object('error',err);
 end;
end $$;
revoke all on all functions in schema app_private from public, anon, authenticated;
revoke all on function public.secure_api(jsonb) from public, anon;
grant execute on function public.secure_api(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
