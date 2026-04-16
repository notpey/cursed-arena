-- ── 006: Match history, disconnect tracking, and game asset storage ─────────

-- ── 1. Add last_activity_at to matches ──────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

-- Backfill: use created_at as a reasonable baseline
UPDATE public.matches
SET last_activity_at = created_at
WHERE last_activity_at = now()
  AND created_at IS NOT NULL;

-- ── 2. Match history table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_history (
  id              text PRIMARY KEY,
  player_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  result          text NOT NULL CHECK (result IN ('WIN', 'LOSS')),
  mode            text NOT NULL CHECK (mode IN ('ranked', 'quick', 'private')),
  opponent_name   text NOT NULL DEFAULT '',
  opponent_title  text NOT NULL DEFAULT '',
  opponent_rank_label text,
  your_team       text[] NOT NULL DEFAULT '{}',
  their_team      text[] NOT NULL DEFAULT '{}',
  rounds          integer NOT NULL DEFAULT 1,
  lp_delta        integer NOT NULL DEFAULT 0,
  rank_before     text NOT NULL DEFAULT '',
  rank_after      text NOT NULL DEFAULT '',
  room_code       text,
  played_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players read own history"
  ON public.match_history FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "players insert own history"
  ON public.match_history FOR INSERT
  WITH CHECK (auth.uid() = player_id);

CREATE INDEX IF NOT EXISTS match_history_player_played
  ON public.match_history (player_id, played_at DESC);

-- ── 3. Game-assets storage bucket ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-assets', 'game-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (anyone can view portraits and ability icons)
CREATE POLICY "game-assets public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'game-assets');

-- Authenticated write / replace
CREATE POLICY "game-assets authenticated insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'game-assets' AND auth.role() = 'authenticated');

CREATE POLICY "game-assets authenticated update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'game-assets' AND auth.role() = 'authenticated');

CREATE POLICY "game-assets authenticated delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'game-assets' AND auth.role() = 'authenticated');
