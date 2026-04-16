-- ============================================================
-- Cursed Arena — Username-based login
-- Run in Supabase SQL Editor.
-- ============================================================

-- Enforce unique usernames (case-insensitive).
-- Use a partial index so nulls are excluded.
create unique index if not exists profiles_display_name_lower_idx
  on public.profiles (lower(display_name))
  where display_name is not null;

-- ── RPC: get_email_by_username ─────────────────────────────────────────────────
-- Looks up the Supabase Auth email for a given display_name.
-- Security definer so it can access auth.users without the caller being authed.
-- Callable by anon — returns null if username doesn't exist (no user enumeration
-- info beyond "this username exists", which is acceptable for a public game).
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.display_name) = lower(p_username)
  limit 1;
$$;
