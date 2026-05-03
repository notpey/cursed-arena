-- Harden player avatar persistence.
-- Avatar uploads need both Storage write access and profile insert/update access
-- because a logged-in user may not have a profile row yet.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text null,
  role text not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text not null default '',
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

drop policy if exists "profiles: self insert" on public.profiles;
create policy "profiles: self insert"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles: self update" on public.profiles;
create policy "profiles: self update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

insert into storage.buckets (id, name, public)
values ('player-avatars', 'player-avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "player_avatars_read_public" on storage.objects;
create policy "player_avatars_read_public"
  on storage.objects for select
  using (bucket_id = 'player-avatars');

drop policy if exists "player_avatars_write_own_folder" on storage.objects;
create policy "player_avatars_write_own_folder"
  on storage.objects for insert
  with check (bucket_id = 'player-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "player_avatars_update_own_folder" on storage.objects;
create policy "player_avatars_update_own_folder"
  on storage.objects for update
  using (bucket_id = 'player-avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'player-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
