-- Per-player unlock mission progress, persisted to Supabase.
-- Mirrors the shape of the localStorage 'ca-unlock-missions-v1' store.
-- Merged with local progress on sign-in (take-highest per mission).
--
-- NOTE: Progress is written directly from the client. This is acceptable for
-- casual unlock/progression where a motivated player can only inflate their own
-- unlocks. If this data is ever used for ranked rewards or competitive integrity
-- it must move to a server-side function with authoritative validation.

CREATE TABLE IF NOT EXISTS player_mission_progress (
  player_id    uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mission_id   text        NOT NULL,
  progress     integer     NOT NULL DEFAULT 0,
  completed    boolean     NOT NULL DEFAULT false,
  completed_at timestamptz NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, mission_id)
);

ALTER TABLE player_mission_progress ENABLE ROW LEVEL SECURITY;

-- Players may read only their own rows.
CREATE POLICY "player_mission_progress_select" ON player_mission_progress
  FOR SELECT
  USING (player_id = auth.uid());

-- Players may insert rows only for themselves.
CREATE POLICY "player_mission_progress_insert" ON player_mission_progress
  FOR INSERT
  WITH CHECK (player_id = auth.uid());

-- Players may update only their own rows.
CREATE POLICY "player_mission_progress_update" ON player_mission_progress
  FOR UPDATE
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

-- DELETE is not granted; rows are de-activated by the application, not removed.

CREATE INDEX IF NOT EXISTS player_mission_progress_player
  ON player_mission_progress (player_id);

-- Keep updated_at current on every update (reuses the shared helper from 001).
DROP TRIGGER IF EXISTS player_mission_progress_updated_at ON player_mission_progress;
CREATE TRIGGER player_mission_progress_updated_at
  BEFORE UPDATE ON player_mission_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
