-- Counts only: does not reveal hashes, emails, names or comment bodies.
select
 (select count(*) from public.players) as source_members,
 (select count(*) from app_private.state s cross join lateral jsonb_each(s.data->'members')) as migrated_members,
 (select count(*) from public.votes) as source_votes,
 (select count(*) from app_private.state s cross join lateral jsonb_each(s.data->'votes') a cross join lateral jsonb_each(a.value)) as migrated_votes,
 (select count(*) from auth.users) as auth_accounts,
 (select count(*) from app_private.account_links) as linked_accounts,
 (select count(*) from pg_policies where schemaname='public' and tablename in ('players','votes','app_config')) as legacy_policies;
