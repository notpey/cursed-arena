-- Admin-controlled unlock overrides per player.
-- Used by LiveOpsPanel's Unlocks tab to grant or revoke mission-gated unlocks.
-- granted=true grants the unlock regardless of mission progress;
-- granted=false explicitly revokes it (even if the mission was completed).

CREATE TABLE IF NOT EXISTS player_unlock_overrides (
  player_id  uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mission_id text        NOT NULL,
  granted    boolean     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, mission_id)
);

ALTER TABLE player_unlock_overrides ENABLE ROW LEVEL SECURITY;

-- Players can read their own overrides (so client can apply them).
CREATE POLICY "player_unlock_overrides_self_read" ON player_unlock_overrides
  FOR SELECT USING (player_id = auth.uid());

-- Only service-role / admin can write (LiveOpsPanel uses service key or admin RPC).
-- If your app uses the anon key for admin actions, replace this with a role check.
CREATE POLICY "player_unlock_overrides_admin_write" ON player_unlock_overrides
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS player_unlock_overrides_player
  ON player_unlock_overrides (player_id);
