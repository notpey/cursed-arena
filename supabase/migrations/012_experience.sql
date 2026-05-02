-- Migration 012: Replace LP columns with experience columns.
--
-- The LP system (Bronze/Silver/Platinum/Diamond) is replaced by a
-- Naruto-Arena-style experience + level system with JJK-themed rank titles.
--
-- Strategy: add new columns alongside old ones, backfill, then keep both
-- until all application code has been updated and verified.
-- Old lp_current / peak_lp columns are retained as compatibility aliases.
-- Remove them in a future migration once the rollout is complete.

-- ── player_battle_profiles ────────────────────────────────────────────────────

ALTER TABLE player_battle_profiles
  ADD COLUMN IF NOT EXISTS experience     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_experience integer NOT NULL DEFAULT 0;

-- Backfill experience from lp_current for existing rows.
-- lp values were in the same numeric range as experience (0–∞), so a 1:1 copy
-- gives a reasonable starting point. Players keep their prior "LP" as XP.
UPDATE player_battle_profiles
SET
  experience     = lp_current,
  peak_experience = peak_lp
WHERE experience = 0;

-- Index for leaderboard queries (mirror the lp index).
CREATE INDEX IF NOT EXISTS player_battle_profiles_experience_desc
  ON player_battle_profiles (experience DESC);

-- ── battle_match_history ──────────────────────────────────────────────────────

ALTER TABLE battle_match_history
  ADD COLUMN IF NOT EXISTS experience_delta integer NOT NULL DEFAULT 0;

-- Backfill from lp_delta for existing rows.
UPDATE battle_match_history
SET experience_delta = lp_delta
WHERE experience_delta = 0 AND lp_delta <> 0;

-- ── profiles (leaderboard source) ────────────────────────────────────────────
-- The profiles table currently uses lp for the leaderboard and matchmaking.
-- Add an experience column for future use; backfill from lp.
-- The TypeScript ranking/client.ts still reads profiles.lp until this column
-- is confirmed stable in production.
--
-- TODO: Once experience column is in production, update:
--   - ranking/client.ts to SELECT experience instead of lp
--   - settle_match_lp RPC → rename to settle_match_experience
--   - matchmaking_queue.lp → matchmaking_queue.experience

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS experience integer NOT NULL DEFAULT 0;

UPDATE profiles
SET experience = lp
WHERE experience = 0 AND lp > 0;

CREATE INDEX IF NOT EXISTS profiles_experience_desc_idx
  ON profiles (experience DESC);

-- ── matchmaking_queue ─────────────────────────────────────────────────────────
-- Add experience column; the TypeScript client still writes lp as a compat
-- fallback until this is confirmed deployed.

ALTER TABLE matchmaking_queue
  ADD COLUMN IF NOT EXISTS experience integer NOT NULL DEFAULT 0;

UPDATE matchmaking_queue
SET experience = lp
WHERE experience = 0 AND lp > 0;

-- ── settle_match_lp compatibility note ───────────────────────────────────────
-- The settle_match_lp() RPC is NOT modified in this migration.
-- It still awards fixed +25/-20 LP (treated as XP by the TypeScript layer).
-- A future migration should create settle_match_experience() with variable
-- XP deltas based on both players' levels, and retire settle_match_lp.
