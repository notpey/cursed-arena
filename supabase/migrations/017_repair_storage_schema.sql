-- Repair storage.objects schema for older Supabase projects.
--
-- The current Supabase Storage API requires user_metadata and version
-- columns on storage.objects. Projects created before these columns were
-- introduced will return "The database schema is invalid or incompatible"
-- on every upload attempt, even with correct bucket policies.
--
-- ============================================================
-- MANUAL APPLY REQUIRED FOR LIVE PROJECT mzpfwxrdituexjpwqlqz
-- ============================================================
-- Run in the Supabase Dashboard SQL editor:
--   https://supabase.com/dashboard/project/mzpfwxrdituexjpwqlqz/sql/new
--
-- Verification: after running, attempt an ACP upload — it should succeed
-- with no "schema is invalid or incompatible" error in the console.
-- ============================================================

alter table storage.objects
  add column if not exists user_metadata jsonb,
  add column if not exists version text;
