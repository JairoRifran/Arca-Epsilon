begin;

-- ---------------------------------------------------------------------------
-- Owner role
--
-- Kept in a table rather than a JWT claim or user metadata: metadata is
-- writable by the account it belongs to, so a claim-based check would let any
-- player promote themselves. Nothing here is writable through the API at all --
-- membership is granted from the SQL editor by the project owner.
-- ---------------------------------------------------------------------------
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'analyst')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.app_admins enable row level security;

-- A signed-in user may check their own membership, and nothing else. This is
-- what lets the dashboard decide whether to render without trusting the client.
drop policy if exists "admins_select_own" on public.app_admins;
create policy "admins_select_own" on public.app_admins
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;

create or replace function public.is_arca_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$fn$;

grant execute on function public.is_arca_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Play sessions
--
-- Registration counts come from player_profiles.created_at and last-played from
-- save_slots.updated_at, but neither can answer "how much is the game actually
-- being played". A heartbeat row per session gives daily actives and session
-- length without shipping a telemetry pipeline.
-- ---------------------------------------------------------------------------
create table if not exists public.play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  mission_step text,
  client text,
  check (last_seen_at >= started_at)
);

create index if not exists play_sessions_user_idx on public.play_sessions(user_id);
create index if not exists play_sessions_last_seen_idx on public.play_sessions(last_seen_at desc);

alter table public.play_sessions enable row level security;

drop policy if exists "sessions_select_own" on public.play_sessions;
create policy "sessions_select_own" on public.play_sessions
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.play_sessions from anon, authenticated;
grant select on public.play_sessions to authenticated;

/*
 * Records progress for the caller's current session.
 *
 * Returns the session id so the client keeps beating into the same row. A null
 * or foreign id starts a fresh session, which is also what happens when the
 * player reloads the page -- exactly the boundary a session should have.
 */
create or replace function public.record_play_heartbeat(
  p_session_id uuid,
  p_mission_step text default null,
  p_client text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  caller uuid := auth.uid();
  session_id uuid;
begin
  if caller is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_session_id is not null then
    update public.play_sessions
    set
      last_seen_at = timezone('utc', now()),
      mission_step = coalesce(left(p_mission_step, 64), mission_step)
    where id = p_session_id and user_id = caller
    returning id into session_id;
    if session_id is not null then
      return session_id;
    end if;
  end if;

  insert into public.play_sessions (user_id, mission_step, client)
  values (caller, left(p_mission_step, 64), left(p_client, 64))
  returning id into session_id;
  return session_id;
end;
$fn$;

revoke all on function public.record_play_heartbeat(uuid, text, text) from public;
grant execute on function public.record_play_heartbeat(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner reads
--
-- Deliberately RPCs rather than owner-wide RLS policies on the base tables: the
-- dashboard only ever receives the shapes below, so a mistake in the client
-- cannot turn into "select everything from every player's save payload".
-- ---------------------------------------------------------------------------
create or replace function public.assert_arca_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_arca_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
end;
$fn$;

create or replace function public.owner_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  result jsonb;
begin
  perform public.assert_arca_admin();
  select jsonb_build_object(
    'players', (select count(*) from public.player_profiles),
    'newToday', (select count(*) from public.player_profiles
                 where created_at >= date_trunc('day', timezone('utc', now()))),
    'new7d', (select count(*) from public.player_profiles
              where created_at >= timezone('utc', now()) - interval '7 days'),
    'new30d', (select count(*) from public.player_profiles
               where created_at >= timezone('utc', now()) - interval '30 days'),
    'activeToday', (select count(distinct user_id) from public.play_sessions
                    where last_seen_at >= date_trunc('day', timezone('utc', now()))),
    'active7d', (select count(distinct user_id) from public.play_sessions
                 where last_seen_at >= timezone('utc', now()) - interval '7 days'),
    'sessions7d', (select count(*) from public.play_sessions
                   where started_at >= timezone('utc', now()) - interval '7 days'),
    'medianSessionMinutes', coalesce((
      select round((percentile_cont(0.5) within group (
        order by extract(epoch from (last_seen_at - started_at)) / 60.0))::numeric, 1)
      from public.play_sessions
      where started_at >= timezone('utc', now()) - interval '30 days'
        and last_seen_at > started_at), 0),
    'totalPlayHours', coalesce((
      select round((sum(extract(epoch from (last_seen_at - started_at))) / 3600.0)::numeric, 1)
      from public.play_sessions), 0),
    'savedPlayers', (select count(distinct user_id) from public.save_slots),
    'verifiedPlayers', (select count(*) from auth.users where email_confirmed_at is not null),
    'generatedAt', timezone('utc', now())
  ) into result;
  return result;
end;
$fn$;

/* Signups and activity on one axis, so the dashboard can draw them together. */
create or replace function public.owner_daily_series(p_days integer default 30)
returns table (day date, signups bigint, active_players bigint, sessions bigint)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  span integer := least(greatest(coalesce(p_days, 30), 1), 180);
begin
  perform public.assert_arca_admin();
  return query
  with days as (
    select generate_series(
      (date_trunc('day', timezone('utc', now())) - ((span - 1) || ' days')::interval)::date,
      date_trunc('day', timezone('utc', now()))::date,
      '1 day'::interval
    )::date as day
  )
  select
    days.day,
    (select count(*) from public.player_profiles p
      where p.created_at >= days.day and p.created_at < days.day + 1)::bigint,
    (select count(distinct s.user_id) from public.play_sessions s
      where s.last_seen_at >= days.day and s.last_seen_at < days.day + 1)::bigint,
    (select count(*) from public.play_sessions s
      where s.started_at >= days.day and s.started_at < days.day + 1)::bigint
  from days
  order by days.day;
end;
$fn$;

/* One row per player. Paged, searchable, and never returns save payloads. */
create or replace function public.owner_player_list(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  provider text,
  created_at timestamptz,
  email_confirmed boolean,
  last_seen_at timestamptz,
  last_save_at timestamptz,
  sessions bigint,
  play_minutes numeric,
  mission_step text,
  stats jsonb,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  span integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  skip integer := greatest(coalesce(p_offset, 0), 0);
  needle text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform public.assert_arca_admin();
  return query
  with base as (
    select
      p.user_id as b_user_id,
      p.display_name as b_display_name,
      u.email::text as b_email,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email') as b_provider,
      p.created_at as b_created_at,
      (u.email_confirmed_at is not null) as b_email_confirmed,
      (select max(s.last_seen_at) from public.play_sessions s where s.user_id = p.user_id) as b_last_seen_at,
      (select max(v.updated_at) from public.save_slots v where v.user_id = p.user_id) as b_last_save_at,
      (select count(*) from public.play_sessions s where s.user_id = p.user_id) as b_sessions,
      coalesce((select round((sum(extract(epoch from (s.last_seen_at - s.started_at))) / 60.0)::numeric, 1)
                from public.play_sessions s where s.user_id = p.user_id), 0) as b_play_minutes,
      (select s.mission_step from public.play_sessions s
        where s.user_id = p.user_id and s.mission_step is not null
        order by s.last_seen_at desc limit 1) as b_mission_step,
      p.stats as b_stats
    from public.player_profiles p
    join auth.users u on u.id = p.user_id
    where needle is null
      or p.display_name ilike '%' || needle || '%'
      or u.email ilike '%' || needle || '%'
  )
  select
    base.b_user_id, base.b_display_name, base.b_email, base.b_provider,
    base.b_created_at, base.b_email_confirmed, base.b_last_seen_at,
    base.b_last_save_at, base.b_sessions, base.b_play_minutes,
    base.b_mission_step, base.b_stats,
    (select count(*) from base)::bigint
  from base
  order by base.b_last_seen_at desc nulls last, base.b_created_at desc
  limit span offset skip;
end;
$fn$;

/* Where players are in the campaign, read from the most recent session step. */
create or replace function public.owner_progression()
returns table (mission_step text, players bigint)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  perform public.assert_arca_admin();
  return query
  select
    coalesce(latest.mission_step, 'sin registro'),
    count(*)::bigint
  from public.player_profiles p
  left join lateral (
    select s.mission_step
    from public.play_sessions s
    where s.user_id = p.user_id and s.mission_step is not null
    order by s.last_seen_at desc
    limit 1
  ) latest on true
  group by 1
  order by 2 desc, 1;
end;
$fn$;

revoke all on function public.owner_overview() from public;
revoke all on function public.owner_daily_series(integer) from public;
revoke all on function public.owner_player_list(text, integer, integer) from public;
revoke all on function public.owner_progression() from public;
grant execute on function public.owner_overview() to authenticated;
grant execute on function public.owner_daily_series(integer) to authenticated;
grant execute on function public.owner_player_list(text, integer, integer) to authenticated;
grant execute on function public.owner_progression() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- GRANT YOURSELF ACCESS
--
-- No account is an admin until you say so. Run this once in the Supabase SQL
-- editor with your own address; every owner RPC above raises ADMIN_REQUIRED
-- until it succeeds.
--
--   insert into public.app_admins (user_id, role)
--   select id, 'owner' from auth.users where email = 'tu-email@ejemplo.com'
--   on conflict (user_id) do nothing;
-- ---------------------------------------------------------------------------
