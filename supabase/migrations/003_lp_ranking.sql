-- ============================================================
-- Cursed Arena — LP / Ranking system
-- Run in Supabase SQL Editor.
-- ============================================================

-- ── Add LP and match-stat columns to profiles ─────────────────────────────────
alter table public.profiles
  add column if not exists lp          integer not null default 0,
  add column if not exists wins        integer not null default 0,
  add column if not exists losses      integer not null default 0,
  add column if not exists win_streak  integer not null default 0,
  add column if not exists best_streak integer not null default 0;

-- Fast descending LP order for leaderboard queries
create index if not exists profiles_lp_desc_idx on public.profiles (lp desc);

-- ── Add lp_settled flag to matches ───────────────────────────────────────────
-- Prevents the LP RPC from running twice if both clients race to call it.
alter table public.matches
  add column if not exists lp_settled boolean not null default false;

-- ── RPC: settle_match_lp ─────────────────────────────────────────────────────
-- Atomically awards +25 LP to the winner and deducts -20 LP from the loser.
-- Idempotent: returns {already_settled: true} if called more than once.
-- Security: caller must be a participant in the match.
create or replace function public.settle_match_lp(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match     matches%rowtype;
  v_winner_id uuid;
  v_loser_id  uuid;
  v_lp_gain   constant integer := 25;
  v_lp_loss   constant integer := 20;
  v_w_lp      integer;
  v_l_lp      integer;
begin
  -- Lock the row to prevent concurrent settlement
  select * into v_match from matches where id = p_match_id for update;

  if not found then
    return jsonb_build_object('error', 'match not found');
  end if;

  -- Security: caller must be a participant
  if auth.uid() != v_match.player_a_id and auth.uid() != v_match.player_b_id then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- Idempotent guard
  if v_match.lp_settled then
    return jsonb_build_object('already_settled', true);
  end if;

  -- Only ranked matches affect LP
  if v_match.mode != 'ranked' then
    update matches set lp_settled = true where id = p_match_id;
    return jsonb_build_object('lp_gain', 0, 'lp_loss', 0, 'winner_lp', null, 'loser_lp', null);
  end if;

  -- Must be finished
  if v_match.status != 'finished' then
    return jsonb_build_object('error', 'match not finished');
  end if;

  -- Canonical: player_a = 'player', player_b = 'enemy'
  if v_match.winner = 'player' then
    v_winner_id := v_match.player_a_id;
    v_loser_id  := v_match.player_b_id;
  else
    v_winner_id := v_match.player_b_id;
    v_loser_id  := v_match.player_a_id;
  end if;

  -- Update winner
  update profiles
  set
    lp          = greatest(0, lp + v_lp_gain),
    wins        = wins + 1,
    win_streak  = win_streak + 1,
    best_streak = greatest(best_streak, win_streak + 1)
  where id = v_winner_id
  returning lp into v_w_lp;

  -- Update loser
  update profiles
  set
    lp         = greatest(0, lp - v_lp_loss),
    losses     = losses + 1,
    win_streak = 0
  where id = v_loser_id
  returning lp into v_l_lp;

  -- Mark settled
  update matches set lp_settled = true where id = p_match_id;

  return jsonb_build_object(
    'lp_gain',   v_lp_gain,
    'lp_loss',   v_lp_loss,
    'winner_lp', v_w_lp,
    'loser_lp',  v_l_lp
  );
end;
$$;
