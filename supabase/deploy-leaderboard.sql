-- Ranked Ladder / Season Leaderboard
-- Run in Supabase SQL Editor

create table if not exists pvp_leaderboard (
  user_id uuid references profiles(id) on delete cascade,
  season_id text not null,
  display_name text not null,
  rating integer not null default 1000,
  updated_at timestamp with time zone default now(),
  primary key (user_id, season_id)
);

alter table pvp_leaderboard enable row level security;

drop policy if exists "Leaderboard readable by all" on pvp_leaderboard;
create policy "Leaderboard readable by all"
  on pvp_leaderboard for select
  to authenticated
  using (true);

drop policy if exists "Leaderboard insertable by owner" on pvp_leaderboard;
create policy "Leaderboard insertable by owner"
  on pvp_leaderboard for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Leaderboard updatable by owner" on pvp_leaderboard;
create policy "Leaderboard updatable by owner"
  on pvp_leaderboard for update
  to authenticated
  using (auth.uid() = user_id);
