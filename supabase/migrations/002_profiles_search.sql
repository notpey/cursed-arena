-- ============================================================
-- Allow authenticated users to search other players by
-- display_name. Required for the username-challenge flow.
-- ============================================================

-- If the profiles table doesn't already have RLS enabled, enable it.
alter table public.profiles enable row level security;

-- Drop the policy first in case it already exists (idempotent).
drop policy if exists "profiles: authenticated can read all" on public.profiles;

create policy "profiles: authenticated can read all"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Also enable Realtime on matches for INSERT events
-- (needed so Player B gets notified of incoming challenges).
-- alter publication supabase_realtime add table public.matches;
-- (Already done in 001 — no-op if run again, Postgres deduplicates.)
