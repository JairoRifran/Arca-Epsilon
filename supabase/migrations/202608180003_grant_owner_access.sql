begin;

-- ---------------------------------------------------------------------------
-- Owner access
--
-- Grants the project owner's account admin rights on the console. Split out
-- from the schema migration on purpose: the tables and RPCs are structure and
-- apply anywhere, while this is a fact about one deployment's data.
--
-- Idempotent, and a no-op if the account has not registered in this Supabase
-- project yet -- the select simply matches no rows. Re-run this file after
-- signing up if that happens.
-- ---------------------------------------------------------------------------
insert into public.app_admins (user_id, role)
select users.id, 'owner'
from auth.users as users
where lower(users.email) = lower('rifranjairo@gmail.com')
on conflict (user_id) do update set role = 'owner';

commit;
