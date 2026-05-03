-- Repair/refresh game-assets Storage setup used by ACP fighter portraits and ability icons.
-- Earlier migrations created the bucket with ON CONFLICT DO NOTHING, so a preexisting
-- private bucket could stay private after migrations were run.
--
-- ============================================================
-- MANUAL APPLY REQUIRED FOR LIVE PROJECT mzpfwxrdituexjpwqlqz
-- ============================================================
-- Supabase CLI migrations are NOT automatically applied to the
-- hosted project. If uploads return 400 or images load broken,
-- run this migration manually:
--
--   Option A — Supabase Dashboard SQL editor:
--     1. Go to https://supabase.com/dashboard/project/mzpfwxrdituexjpwqlqz/sql/new
--     2. Paste the SQL below the header comments and run it.
--
--   Option B — Supabase CLI (requires linked project):
--     supabase db push --project-ref mzpfwxrdituexjpwqlqz
--
--   Option C — psql (requires DB password):
--     psql "postgresql://postgres:[PASSWORD]@db.mzpfwxrdituexjpwqlqz.supabase.co:5432/postgres" \
--       -f supabase/migrations/016_repair_game_assets_storage.sql
--
-- Verification checklist after applying:
--   [ ] storage.buckets WHERE id = 'game-assets' has public = true
--   [ ] storage.objects policies include "game-assets public read" (no auth check on SELECT)
--   [ ] ACP upload succeeds and the returned URL contains /storage/v1/object/public/
--   [ ] Image loads in browser at that URL without a 400 or 403
-- ============================================================

insert into storage.buckets (id, name, public)
values ('game-assets', 'game-assets', true)
on conflict (id) do update
set public = true;

drop policy if exists "game-assets public read" on storage.objects;
create policy "game-assets public read"
  on storage.objects for select
  using (bucket_id = 'game-assets');

drop policy if exists "game-assets authenticated insert" on storage.objects;
create policy "game-assets authenticated insert"
  on storage.objects for insert
  with check (bucket_id = 'game-assets' and auth.role() = 'authenticated');

drop policy if exists "game-assets authenticated update" on storage.objects;
create policy "game-assets authenticated update"
  on storage.objects for update
  using (bucket_id = 'game-assets' and auth.role() = 'authenticated')
  with check (bucket_id = 'game-assets' and auth.role() = 'authenticated');

drop policy if exists "game-assets authenticated delete" on storage.objects;
create policy "game-assets authenticated delete"
  on storage.objects for delete
  using (bucket_id = 'game-assets' and auth.role() = 'authenticated');
