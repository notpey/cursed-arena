-- Battle persistence tables for per-user match/profile storage.
-- These back the async read/write functions in src/features/battle/persistence.ts.

-- ── player_battle_profiles ────────────────────────────────────────────────────
-- Stores the client-side battle profile stats (LP, wins, losses, streaks).
-- Separate from the 'profiles' table which holds auth/display data.

CREATE TABLE IF NOT EXISTS player_battle_profiles (
  player_id      uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lp_current     integer     NOT NULL DEFAULT 1480,
  peak_lp        integer     NOT NULL DEFAULT 0,
  wins           integer     NOT NULL DEFAULT 0,
  losses         integer     NOT NULL DEFAULT 0,
  current_streak integer     NOT NULL DEFAULT 0,
  best_streak    integer     NOT NULL DEFAULT 0,
  matches_played integer     NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id)
);

ALTER TABLE player_battle_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_battle_profiles_self_rw" ON player_battle_profiles
  FOR ALL USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

-- ── battle_match_history ──────────────────────────────────────────────────────
-- Per-user match log, separate from the multiplayer 'match_history' table.
-- completion_id enforces idempotency: duplicate battle records are rejected
-- at the database level via the unique constraint.

CREATE TABLE IF NOT EXISTS battle_match_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  completion_id       text        NOT NULL,
  result              text        NOT NULL CHECK (result IN ('WIN', 'LOSS', 'DRAW')),
  mode                text        NOT NULL,
  opponent_name       text        NOT NULL,
  opponent_title      text        NOT NULL DEFAULT '',
  opponent_rank_label text,
  your_team           text[]      NOT NULL,
  their_team          text[]      NOT NULL,
  lp_delta            integer     NOT NULL DEFAULT 0,
  rank_before         text        NOT NULL DEFAULT '',
  rank_after          text        NOT NULL DEFAULT '',
  rounds              integer     NOT NULL DEFAULT 0,
  room_code           text,
  played_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, completion_id)
);

ALTER TABLE battle_match_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_match_history_self_rw" ON battle_match_history
  FOR ALL USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE INDEX IF NOT EXISTS battle_match_history_player_played
  ON battle_match_history (player_id, played_at DESC);

-- ── battle_last_results ───────────────────────────────────────────────────────
-- Stores the full LastBattleResult JSON blob for cross-device results display.
-- One row per player (upserted on each match completion).

CREATE TABLE IF NOT EXISTS battle_last_results (
  player_id     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  completion_id text        NOT NULL,
  result_json   jsonb       NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id)
);

ALTER TABLE battle_last_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_last_results_self_rw" ON battle_last_results
  FOR ALL USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());
