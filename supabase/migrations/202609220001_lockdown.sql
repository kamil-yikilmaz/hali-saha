-- Emergency containment: preserves every row; intentionally disables the legacy client.
begin;
revoke all on public.players, public.votes, public.app_config from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
do $$ declare p record; v text; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('players','votes','app_config') loop
 execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
 foreach v in array array['players','votes','app_config'] loop
 execute format('alter table public.%I enable row level security',v);
 end loop;
 foreach v in array array['player_results','anonymous_comments'] loop
 if to_regclass('public.'||v) is not null then
 execute format('revoke all on public.%I from public, anon, authenticated',v);
 execute format('alter view public.%I set (security_invoker=true)',v);
 end if;
 end loop;
end $$;
commit;
