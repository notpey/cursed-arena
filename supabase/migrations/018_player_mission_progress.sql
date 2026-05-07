-- Per-player unlock mission progress, persisted to Supabase.
-- Mirrors the shape of the localStorage 'ca-unlock-missions-v1' store.
-- Merged with local progress on sign-in (take-highest per mission).

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

-- Players read only their own rows.
CREATE POLICY "player_mission_progress_self_read" ON player_mission_progress
  FOR SELECT USING (player_id = auth.uid());

-- Players write only their own rows (battle results are recorded client-side).
CREATE POLICY "player_mission_progress_self_write" ON player_mission_progress
  FOR ALL USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE INDEX IF NOT EXISTS player_mission_progress_player
  ON player_mission_progress (player_id);
