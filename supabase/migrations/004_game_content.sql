-- ============================================================
-- Cursed Arena — Game content table
-- Stores published game content (fighter roster, portraits,
-- default setup) so all users see the same data.
-- Run in Supabase SQL Editor.
-- ============================================================

create table if not exists public.game_content (
  key        text        primary key,
  content    jsonb       not null,
  updated_at timestamptz not null default now()
);

-- updated_at trigger (reuses the function from 001)
drop trigger if exists game_content_updated_at on public.game_content;
create trigger game_content_updated_at
  before update on public.game_content
  for each row execute function public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.game_content enable row level security;

-- Anyone (including anonymous visitors) can read published game content.
create policy "game_content: anyone can read"
  on public.game_content for select
  using (true);

-- Only admins (profiles.role = 'admin') can write.
create policy "game_content: admin can insert"
  on public.game_content for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "game_content: admin can update"
  on public.game_content for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
