-- Clock Out Protocol: account progression, authoritative match stats and
-- inventory groundwork. Run through the Supabase SQL editor or CLI.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Employee' check (char_length(display_name) between 1 and 40),
  avatar_url text not null default '',
  xp bigint not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  coins bigint not null default 0 check (coins >= 0),
  equipped_character text not null default 'a',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  games_played integer not null default 0,
  total_score bigint not null default 0,
  hider_wins integer not null default 0,
  seeker_wins integer not null default 0,
  escapes integer not null default 0,
  catches integer not null default 0,
  missions_completed integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_results (
  id bigint generated always as identity primary key,
  match_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0,
  xp_earned integer not null default 0,
  coins_earned integer not null default 0,
  hider_wins integer not null default 0,
  seeker_wins integer not null default 0,
  escapes integer not null default 0,
  catches integer not null default 0,
  missions_completed integer not null default 0,
  played_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create table if not exists public.cosmetics (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('character', 'hat', 'emote', 'nameplate', 'victory_pose')),
  rarity text not null default 'common',
  price integer not null default 0,
  active boolean not null default true
);

create table if not exists public.user_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_id text not null references public.cosmetics(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

create table if not exists public.recent_players (
  user_id uuid not null references auth.users(id) on delete cascade,
  recent_user_id uuid not null references auth.users(id) on delete cascade,
  last_played_at timestamptz not null default now(),
  primary key (user_id, recent_user_id),
  check (user_id <> recent_user_id)
);

alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.match_results enable row level security;
alter table public.cosmetics enable row level security;
alter table public.user_inventory enable row level security;
alter table public.recent_players enable row level security;

create policy "players read own profile" on public.profiles for select to authenticated using (auth.uid() = user_id);
create policy "players read own stats" on public.player_stats for select to authenticated using (auth.uid() = user_id);
create policy "players read own matches" on public.match_results for select to authenticated using (auth.uid() = user_id);
create policy "everyone reads active cosmetics" on public.cosmetics for select using (active = true);
create policy "players read own inventory" on public.user_inventory for select to authenticated using (auth.uid() = user_id);
create policy "players read own recent players" on public.recent_players for select to authenticated using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Employee'), 40),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  ) on conflict (user_id) do nothing;
  insert into public.player_stats (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.record_match_result(
  p_match_id text,
  p_user_id uuid,
  p_score integer,
  p_xp_earned integer,
  p_coins_earned integer,
  p_hider_wins integer,
  p_seeker_wins integer,
  p_escapes integer,
  p_catches integer,
  p_missions_completed integer
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare inserted_count integer;
begin
  insert into public.match_results (
    match_id, user_id, score, xp_earned, coins_earned, hider_wins,
    seeker_wins, escapes, catches, missions_completed
  ) values (
    p_match_id, p_user_id, greatest(0, p_score), greatest(0, p_xp_earned),
    greatest(0, p_coins_earned), greatest(0, p_hider_wins),
    greatest(0, p_seeker_wins), greatest(0, p_escapes),
    greatest(0, p_catches), greatest(0, p_missions_completed)
  ) on conflict (match_id, user_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  insert into public.profiles (user_id, xp, level, coins)
  values (p_user_id, greatest(0, p_xp_earned), 1 + floor(sqrt(greatest(0, p_xp_earned) / 100.0))::integer, greatest(0, p_coins_earned))
  on conflict (user_id) do update set
    xp = profiles.xp + greatest(0, p_xp_earned),
    level = 1 + floor(sqrt((profiles.xp + greatest(0, p_xp_earned)) / 100.0))::integer,
    coins = profiles.coins + greatest(0, p_coins_earned),
    updated_at = now();

  insert into public.player_stats (
    user_id, games_played, total_score, hider_wins, seeker_wins,
    escapes, catches, missions_completed
  ) values (
    p_user_id, 1, greatest(0, p_score), greatest(0, p_hider_wins),
    greatest(0, p_seeker_wins), greatest(0, p_escapes),
    greatest(0, p_catches), greatest(0, p_missions_completed)
  ) on conflict (user_id) do update set
    games_played = player_stats.games_played + 1,
    total_score = player_stats.total_score + greatest(0, p_score),
    hider_wins = player_stats.hider_wins + greatest(0, p_hider_wins),
    seeker_wins = player_stats.seeker_wins + greatest(0, p_seeker_wins),
    escapes = player_stats.escapes + greatest(0, p_escapes),
    catches = player_stats.catches + greatest(0, p_catches),
    missions_completed = player_stats.missions_completed + greatest(0, p_missions_completed),
    updated_at = now();
  return true;
end;
$$;

revoke all on function public.record_match_result(text, uuid, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.record_match_result(text, uuid, integer, integer, integer, integer, integer, integer, integer, integer) to service_role;
