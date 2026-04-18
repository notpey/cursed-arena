alter table public.matches
  add column if not exists resolution_id text,
  add column if not exists resolution_steps jsonb;

