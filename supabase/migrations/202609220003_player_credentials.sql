begin;

create table if not exists app_private.player_credentials (
  player_id text primary key,
  pass_hash text not null,
  is_default boolean not null default true,
  updated_at timestamptz not null default now()
);

revoke all on app_private.player_credentials from public, anon, authenticated;

-- Seed player_credentials: Eğer public.players içinde kayıtlı pass_hash varsa koru,
-- '123'ün hash'i ile aynı olanlar geçici (is_default=true), farklı olanlar kendi belirlediği (is_default=false) olarak aktarılır:
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='players' and column_name='pass_hash') then
    insert into app_private.player_credentials(player_id, pass_hash, is_default)
    select 
      p.id::text,
      coalesce(nullif(p.pass_hash,''), 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'),
      (coalesce(nullif(p.pass_hash,''), 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3') = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3')
    from public.players p
    where not coalesce(p.is_admin, false)
    on conflict (player_id) do update set
      pass_hash = excluded.pass_hash,
      is_default = excluded.is_default;
  end if;
end $$;

-- public.players haricinde state'de kayıtlı diğer üyeler varsa varsayılan şifre tanımla:
insert into app_private.player_credentials(player_id, pass_hash, is_default)
select key, 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', true
from app_private.state s, jsonb_each(s.data->'members') m
where m.value->>'player' = 'true'
on conflict (player_id) do nothing;

-- Update app_private.snapshot so that admin snapshot includes is_default_password for each member:
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
 out:=out||jsonb_build_object('members',(
   select coalesce(jsonb_agg(
     value || jsonb_build_object(
       'uid', key,
       'locked', s->'locked'?key,
       'is_default_password', coalesce(c.is_default, true)
     ) order by value->>'username'
   ), '[]')
   from jsonb_each(s->'members')
   left join app_private.player_credentials c on c.player_id = key
 ),
 'votes',s->'votes','audit',(select coalesce(jsonb_agg(x order by x.at desc),'[]') from
 (select a.actor,a.action,a.target,extract(epoch from a.at)*1000 as "at" from app_private.audit a order by a.id desc limit 100) x));
 end if;
 return out;
end $$;

-- Update app_private.dispatch:
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
 if action in ('member','deactivate','toggle','unlock','resetOne','resetAll','linkAccount','resetPassword') and me->>'role'<>'admin' then raise exception 'FORBIDDEN'; end if;
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
  insert into app_private.player_credentials(player_id, pass_hash, is_default)
  values(target, 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', true)
  on conflict (player_id) do nothing;
 when 'resetPassword' then
  if coalesce(s->'members'->target->>'player','')<>'true' then raise exception 'INVALID_INPUT'; end if;
  insert into app_private.player_credentials(player_id, pass_hash, is_default, updated_at)
  values(target, 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', true, now())
  on conflict (player_id) do update
  set pass_hash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', is_default = true, updated_at = now();
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
  insert into app_private.account_links(auth_id,player_id) values(auth_target,target);
 else raise exception 'INVALID_ACTION';
 end case;
 if action<>'read' then
 update app_private.state set data=s,updated_at=now() where id=true;
 insert into app_private.audit(actor,action,target) values(actor,action,target);
 end if;
 return app_private.snapshot(s,actor);
end $$;

-- Create public.player_api function callable by anon
create or replace function public.player_api(payload jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_action text := payload->>'action';
  v_username text := btrim(coalesce(payload->>'username', ''));
  v_pass_hash text := btrim(coalesce(payload->>'pass_hash', ''));
  v_player_id text;
  v_cred record;
  v_state jsonb;
  v_new_hash text;
  v_result jsonb;
begin
  if v_username = '' or v_pass_hash = '' then
    return jsonb_build_object('error', 'INVALID_CREDENTIALS');
  end if;

  select data into v_state from app_private.state where id = true;
  if v_state is null then
    return jsonb_build_object('error', 'SYSTEM_ERROR');
  end if;

  -- Find player by username (case-insensitive)
  select key into v_player_id
  from jsonb_each(v_state->'members')
  where lower(value->>'username') = lower(v_username)
    and value->>'active' = 'true'
    and value->>'player' = 'true'
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('error', 'USER_NOT_FOUND');
  end if;

  select * into v_cred from app_private.player_credentials where player_id = v_player_id;
  if v_cred is null or v_cred.pass_hash <> v_pass_hash then
    return jsonb_build_object('error', 'INVALID_PASSWORD');
  end if;

  case v_action
    when 'login', 'read' then
      v_result := app_private.snapshot(v_state, v_player_id);
      v_result := jsonb_set(v_result, '{me,is_default_password}', to_jsonb(v_cred.is_default));
      return v_result;

    when 'change_password' then
      v_new_hash := btrim(coalesce(payload->>'new_pass_hash', ''));
      if char_length(v_new_hash) < 10 or v_new_hash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3' then
        return jsonb_build_object('error', 'INVALID_NEW_PASSWORD');
      end if;
      update app_private.player_credentials
      set pass_hash = v_new_hash, is_default = false, updated_at = now()
      where player_id = v_player_id;
      insert into app_private.audit(actor, action, target) values(v_player_id, 'change_password', v_player_id);
      v_result := app_private.snapshot(v_state, v_player_id);
      v_result := jsonb_set(v_result, '{me,is_default_password}', 'false'::jsonb);
      return v_result;

    when 'vote', 'finalize', 'position' then
      return app_private.dispatch(v_player_id, payload);

    else
      return jsonb_build_object('error', 'INVALID_ACTION');
  end case;
end $$;

revoke all on function public.player_api(jsonb) from public;
grant execute on function public.player_api(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
