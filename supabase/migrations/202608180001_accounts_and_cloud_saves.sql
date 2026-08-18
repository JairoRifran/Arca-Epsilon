begin;

create extension if not exists pgcrypto;

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Piloto Epsilon' check (char_length(display_name) between 2 and 32),
  selected_ship_id text not null default 'epsilon-scout',
  stats jsonb not null default '{"combatMatchesPlayed":0,"combatWins":0,"combatKills":0}'::jsonb,
  preferences jsonb not null default '{"garageAutoRotate":true}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(stats) = 'object'),
  check (jsonb_typeof(preferences) = 'object')
);

create table if not exists public.account_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('email', 'google', 'steam')),
  provider_user_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_user_id)
);

create index if not exists account_identities_user_id_idx on public.account_identities(user_id);

create table if not exists public.player_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_item_id text not null,
  source text not null check (source in ('starter', 'unlock', 'premium', 'dlc', 'event')),
  granted_at timestamptz not null default timezone('utc', now()),
  unique (user_id, catalog_item_id)
);

create index if not exists player_entitlements_user_id_idx on public.player_entitlements(user_id);

create table if not exists public.save_slots (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id text not null check (char_length(slot_id) between 1 and 48),
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  checksum text not null check (char_length(checksum) = 64),
  device_id text not null check (char_length(device_id) between 1 and 96),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, slot_id),
  check (jsonb_typeof(payload) = 'object')
);

alter table public.player_profiles enable row level security;
alter table public.account_identities enable row level security;
alter table public.player_entitlements enable row level security;
alter table public.save_slots enable row level security;

drop policy if exists "profiles_select_own" on public.player_profiles;
create policy "profiles_select_own" on public.player_profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.player_profiles;
create policy "profiles_insert_own" on public.player_profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.player_profiles;
create policy "profiles_update_own" on public.player_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "identities_select_own" on public.account_identities;
create policy "identities_select_own" on public.account_identities
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "entitlements_select_own" on public.player_entitlements;
create policy "entitlements_select_own" on public.player_entitlements
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "saves_select_own" on public.save_slots;
create policy "saves_select_own" on public.save_slots
  for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.account_identities from anon, authenticated;
revoke insert, update, delete on public.player_entitlements from anon, authenticated;
revoke insert, update, delete on public.save_slots from anon, authenticated;
grant select on public.account_identities to authenticated;
grant select on public.player_entitlements to authenticated;
grant select on public.save_slots to authenticated;

create or replace function public.touch_player_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists player_profiles_touch_updated_at on public.player_profiles;
create trigger player_profiles_touch_updated_at
before update on public.player_profiles
for each row execute function public.touch_player_profile_updated_at();

create or replace function public.handle_new_arca_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_name text;
  identity_provider text;
begin
  requested_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  if requested_name is null or char_length(requested_name) < 2 then
    requested_name := 'Piloto Epsilon';
  end if;
  identity_provider := new.raw_app_meta_data ->> 'provider';
  if identity_provider not in ('email', 'google', 'steam') then
    identity_provider := 'email';
  end if;

  insert into public.player_profiles (user_id, display_name)
  values (new.id, coalesce(left(requested_name, 32), 'Piloto Epsilon'))
  on conflict (user_id) do nothing;

  insert into public.account_identities (user_id, provider, provider_user_id)
  values (new.id, identity_provider, new.id::text)
  on conflict (provider, provider_user_id) do nothing;

  insert into public.player_entitlements (user_id, catalog_item_id, source)
  values (new.id, 'epsilon-scout', 'starter')
  on conflict (user_id, catalog_item_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_arca on auth.users;
create trigger on_auth_user_created_arca
after insert on auth.users
for each row execute function public.handle_new_arca_user();

insert into public.player_profiles (user_id, display_name)
select
  users.id,
  coalesce(left(nullif(trim(users.raw_user_meta_data ->> 'display_name'), ''), 32), 'Piloto Epsilon')
from auth.users as users
on conflict (user_id) do nothing;

insert into public.player_entitlements (user_id, catalog_item_id, source)
select users.id, 'epsilon-scout', 'starter'
from auth.users as users
on conflict (user_id, catalog_item_id) do nothing;

create or replace function public.upsert_save_slot(
  p_slot_id text,
  p_payload jsonb,
  p_expected_revision bigint,
  p_checksum text,
  p_device_id text
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_revision bigint;
  caller_user_id uuid;
begin
  caller_user_id := auth.uid();
  if caller_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_expected_revision < 0 then
    raise exception 'INVALID_SAVE_REVISION';
  end if;

  select slots.revision
  into current_revision
  from public.save_slots as slots
  where slots.user_id = caller_user_id and slots.slot_id = p_slot_id
  for update;

  if current_revision is null then
    if p_expected_revision <> 0 then
      raise exception 'SAVE_REVISION_CONFLICT';
    end if;
    insert into public.save_slots (user_id, slot_id, payload, revision, checksum, device_id)
    values (caller_user_id, p_slot_id, p_payload, 1, p_checksum, p_device_id);
  else
    if current_revision <> p_expected_revision then
      raise exception 'SAVE_REVISION_CONFLICT';
    end if;
    update public.save_slots as slots
    set
      payload = p_payload,
      revision = slots.revision + 1,
      checksum = p_checksum,
      device_id = p_device_id,
      updated_at = timezone('utc', now())
    where slots.user_id = caller_user_id and slots.slot_id = p_slot_id;
  end if;

  return query
  select slots.revision, slots.updated_at
  from public.save_slots as slots
  where slots.user_id = caller_user_id and slots.slot_id = p_slot_id;
end;
$$;

revoke all on function public.upsert_save_slot(text, jsonb, bigint, text, text) from public;
grant execute on function public.upsert_save_slot(text, jsonb, bigint, text, text) to authenticated;

commit;
