-- Deploy Daily Rewards & Achievements System
-- Run this in Supabase SQL Editor

-- Daily login rewards system
create table if not exists daily_rewards (
  user_id uuid primary key references auth.users on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_claim_date date,
  total_logins integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table daily_rewards enable row level security;

drop policy if exists "Daily rewards readable by owner" on daily_rewards;
create policy "Daily rewards readable by owner"
on daily_rewards for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Daily rewards insertable by owner" on daily_rewards;
create policy "Daily rewards insertable by owner"
on daily_rewards for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Daily rewards updatable by owner" on daily_rewards;
create policy "Daily rewards updatable by owner"
on daily_rewards for update
to authenticated
using (auth.uid() = user_id);

-- Achievements system
create table if not exists achievements (
  id text primary key,
  name text not null,
  description text not null,
  category text not null,
  requirement_type text not null,
  requirement_target integer not null,
  reward_soft_currency integer not null default 0,
  reward_premium_currency integer not null default 0,
  reward_title text,
  icon text,
  rarity text not null default 'common',
  is_hidden boolean not null default false,
  created_at timestamp with time zone default now()
);

-- Achievement progress tracking
create table if not exists achievement_progress (
  user_id uuid references auth.users on delete cascade,
  achievement_id text references achievements on delete cascade,
  progress integer not null default 0,
  is_completed boolean not null default false,
  completed_at timestamp with time zone,
  rewards_claimed boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  primary key (user_id, achievement_id)
);

alter table achievement_progress enable row level security;

drop policy if exists "Achievement progress readable by owner" on achievement_progress;
create policy "Achievement progress readable by owner"
on achievement_progress for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Achievement progress insertable by owner" on achievement_progress;
create policy "Achievement progress insertable by owner"
on achievement_progress for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Achievement progress updatable by owner" on achievement_progress;
create policy "Achievement progress updatable by owner"
on achievement_progress for update
to authenticated
using (auth.uid() = user_id);

-- Achievements readable by all authenticated users
alter table achievements enable row level security;

drop policy if exists "Achievements readable by all" on achievements;
create policy "Achievements readable by all"
on achievements for select
to authenticated
using (true);

-- Admin policies for daily rewards and achievements
drop policy if exists "Admin full access to daily rewards" on daily_rewards;
create policy "Admin full access to daily rewards"
on daily_rewards for all
to authenticated
using (is_admin(auth.uid()))
with check (is_admin(auth.uid()));

drop policy if exists "Admin full access to achievements" on achievements;
create policy "Admin full access to achievements"
on achievements for all
to authenticated
using (is_admin(auth.uid()))
with check (is_admin(auth.uid()));

drop policy if exists "Admin full access to achievement progress" on achievement_progress;
create policy "Admin full access to achievement progress"
on achievement_progress for all
to authenticated
using (is_admin(auth.uid()))
with check (is_admin(auth.uid()));
