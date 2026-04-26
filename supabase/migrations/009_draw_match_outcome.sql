-- Allow authoritative battle resolution to persist true draw outcomes.

alter table public.matches
  drop constraint if exists matches_winner_check;

alter table public.matches
  add constraint matches_winner_check
  check (winner in ('player', 'enemy', 'draw'));

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
  select * into v_match from matches where id = p_match_id for update;

  if not found then
    return jsonb_build_object('error', 'match not found');
  end if;

  if auth.uid() != v_match.player_a_id and auth.uid() != v_match.player_b_id then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if v_match.lp_settled then
    return jsonb_build_object('already_settled', true);
  end if;

  if v_match.mode != 'ranked' then
    update matches set lp_settled = true where id = p_match_id;
    return jsonb_build_object('lp_gain', 0, 'lp_loss', 0, 'winner_lp', null, 'loser_lp', null);
  end if;

  if v_match.status != 'finished' then
    return jsonb_build_object('error', 'match not finished');
  end if;

  if v_match.winner = 'draw' then
    update matches set lp_settled = true where id = p_match_id;
    return jsonb_build_object('lp_gain', 0, 'lp_loss', 0, 'winner_lp', null, 'loser_lp', null, 'draw', true);
  end if;

  if v_match.winner = 'player' then
    v_winner_id := v_match.player_a_id;
    v_loser_id  := v_match.player_b_id;
  else
    v_winner_id := v_match.player_b_id;
    v_loser_id  := v_match.player_a_id;
  end if;

  update profiles
  set
    lp          = greatest(0, lp + v_lp_gain),
    wins        = wins + 1,
    win_streak  = win_streak + 1,
    best_streak = greatest(best_streak, win_streak + 1)
  where id = v_winner_id
  returning lp into v_w_lp;

  update profiles
  set
    lp         = greatest(0, lp - v_lp_loss),
    losses     = losses + 1,
    win_streak = 0
  where id = v_loser_id
  returning lp into v_l_lp;

  update matches set lp_settled = true where id = p_match_id;

  return jsonb_build_object(
    'lp_gain',   v_lp_gain,
    'lp_loss',   v_lp_loss,
    'winner_lp', v_w_lp,
    'loser_lp',  v_l_lp
  );
end;
$$;
