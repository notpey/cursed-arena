-- Server-authoritative multiplayer match history and counted finish metadata.

alter table public.matches
  add column if not exists finished_at timestamptz,
  add column if not exists finish_reason text,
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_status text,
  add column if not exists surrendered_by uuid references auth.users(id),
  add column if not exists abandoned_reason text;

alter table public.profiles
  add column if not exists matches_played integer not null default 0;

alter table public.match_history
  add column if not exists match_id uuid references public.matches(id) on delete cascade,
  add column if not exists experience_delta integer not null default 0,
  add column if not exists experience_before integer not null default 0,
  add column if not exists experience_after integer not null default 0,
  add column if not exists level_before integer not null default 1,
  add column if not exists level_after integer not null default 1,
  add column if not exists rank_title_before text not null default '',
  add column if not exists rank_title_after text not null default '',
  add column if not exists finish_reason text;

create unique index if not exists match_history_match_player_unique
  on public.match_history (match_id, player_id)
  where match_id is not null;

create or replace function public.ca_level_for_experience(p_experience integer)
returns integer
language plpgsql
immutable
as $$
declare
  thresholds integer[] := array[
    0,200,535,950,1430,1962,2541,3162,3822,4517,
    5245,6005,6794,7611,8454,9324,10218,11136,12076,13039,
    14023,15028,16054,17099,18163,19246,20347,21466,22603,23757,
    24927,26114,27317,28536,29771,31021,32286,33565,34860,36168,
    37491,38828,40178,41542,42919,44310,45713,47130,48559,50000
  ];
  idx integer;
begin
  for idx in reverse 50..1 loop
    if greatest(0, p_experience) >= thresholds[idx] then
      return idx;
    end if;
  end loop;
  return 1;
end;
$$;

create or replace function public.ca_rank_title_for_level(p_level integer, p_ladder_rank integer default null)
returns text
language plpgsql
immutable
as $$
declare
  level integer := greatest(1, least(50, p_level));
begin
  if level >= 46 and p_ladder_rank = 1 then return 'The Strongest'; end if;
  if level <= 5 then return 'Jujutsu Student'; end if;
  if level <= 10 then return 'Grade 4 Sorcerer'; end if;
  if level <= 15 then return 'Grade 3 Sorcerer'; end if;
  if level <= 20 then return 'Grade 2 Sorcerer'; end if;
  if level <= 25 then return 'Semi-Grade 1 Sorcerer'; end if;
  if level <= 30 then return 'Grade 1 Sorcerer'; end if;
  if level <= 35 then return 'Special Grade Candidate'; end if;
  if level <= 40 then return 'Special Grade Sorcerer'; end if;
  if level <= 45 then return 'Domain Expansion User'; end if;
  return 'Honored One';
end;
$$;

create or replace function public.settle_match_lp(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_name text;
  v_loser_name text;
  v_winner_team text[];
  v_loser_team text[];
  v_lp_gain constant integer := 25;
  v_lp_loss constant integer := 20;
  v_w_before integer := 0;
  v_l_before integer := 0;
  v_w_after integer := 0;
  v_l_after integer := 0;
  v_w_level_before integer;
  v_w_level_after integer;
  v_l_level_before integer;
  v_l_level_after integer;
  v_reason text;
begin
  select * into v_match from matches where id = p_match_id for update;

  if not found then
    return jsonb_build_object('error', 'match not found');
  end if;

  if auth.uid() != v_match.player_a_id and auth.uid() != v_match.player_b_id then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if v_match.status = 'abandoned' then
    return jsonb_build_object('error', 'abandoned matches are not counted');
  end if;

  if v_match.status != 'finished' then
    return jsonb_build_object('error', 'match not finished');
  end if;

  if v_match.winner is null then
    return jsonb_build_object('error', 'finished match has no winner');
  end if;

  if v_match.winner = 'draw' then
    update matches
    set lp_settled = true,
        settled_at = coalesce(settled_at, now()),
        settlement_status = 'settled',
        finished_at = coalesce(finished_at, now()),
        finish_reason = coalesce(finish_reason, 'ko')
    where id = p_match_id;
    return jsonb_build_object('lp_gain', 0, 'lp_loss', 0, 'winner_lp', null, 'loser_lp', null, 'draw', true);
  end if;

  if v_match.winner = 'player' then
    v_winner_id := v_match.player_a_id;
    v_loser_id := v_match.player_b_id;
    v_winner_name := v_match.player_a_display_name;
    v_loser_name := v_match.player_b_display_name;
    v_winner_team := v_match.player_a_team;
    v_loser_team := v_match.player_b_team;
  else
    v_winner_id := v_match.player_b_id;
    v_loser_id := v_match.player_a_id;
    v_winner_name := v_match.player_b_display_name;
    v_loser_name := v_match.player_a_display_name;
    v_winner_team := v_match.player_b_team;
    v_loser_team := v_match.player_a_team;
  end if;

  if v_loser_id is null then
    return jsonb_build_object('error', 'match missing loser');
  end if;

  select coalesce(lp, 0) into v_w_before from profiles where id = v_winner_id for update;
  select coalesce(lp, 0) into v_l_before from profiles where id = v_loser_id for update;

  if not v_match.lp_settled and v_match.mode = 'ranked' then
    v_w_after := greatest(0, v_w_before + v_lp_gain);
    v_l_after := greatest(0, v_l_before - v_lp_loss);

    update profiles
    set lp = v_w_after,
        wins = wins + 1,
        matches_played = matches_played + 1,
        win_streak = win_streak + 1,
        best_streak = greatest(best_streak, win_streak + 1)
    where id = v_winner_id;

    update profiles
    set lp = v_l_after,
        losses = losses + 1,
        matches_played = matches_played + 1,
        win_streak = 0
    where id = v_loser_id;
  else
    v_w_after := v_w_before;
    v_l_after := v_l_before;
  end if;

  v_w_level_before := ca_level_for_experience(v_w_before);
  v_w_level_after := ca_level_for_experience(v_w_after);
  v_l_level_before := ca_level_for_experience(v_l_before);
  v_l_level_after := ca_level_for_experience(v_l_after);
  v_reason := coalesce(v_match.finish_reason, 'ko');

  insert into match_history (
    id, match_id, player_id, result, mode, opponent_name, opponent_title,
    your_team, their_team, rounds, lp_delta, experience_delta, experience_before,
    experience_after, level_before, level_after, rank_before, rank_after,
    rank_title_before, rank_title_after, finish_reason, room_code, played_at
  ) values (
    p_match_id::text || ':' || v_winner_id::text, p_match_id, v_winner_id, 'WIN', v_match.mode,
    coalesce(v_loser_name, 'Opponent'), 'Online Match', v_winner_team, v_loser_team, v_match.current_round,
    case when v_match.mode = 'ranked' then v_lp_gain else 0 end,
    case when v_match.mode = 'ranked' then v_lp_gain else 0 end,
    v_w_before, v_w_after, v_w_level_before, v_w_level_after,
    ca_rank_title_for_level(v_w_level_before), ca_rank_title_for_level(v_w_level_after),
    ca_rank_title_for_level(v_w_level_before), ca_rank_title_for_level(v_w_level_after),
    v_reason, v_match.room_code, now()
  )
  on conflict (match_id, player_id) where match_id is not null do nothing;

  insert into match_history (
    id, match_id, player_id, result, mode, opponent_name, opponent_title,
    your_team, their_team, rounds, lp_delta, experience_delta, experience_before,
    experience_after, level_before, level_after, rank_before, rank_after,
    rank_title_before, rank_title_after, finish_reason, room_code, played_at
  ) values (
    p_match_id::text || ':' || v_loser_id::text, p_match_id, v_loser_id, 'LOSS', v_match.mode,
    coalesce(v_winner_name, 'Opponent'), 'Online Match', v_loser_team, v_winner_team, v_match.current_round,
    case when v_match.mode = 'ranked' then -v_lp_loss else 0 end,
    case when v_match.mode = 'ranked' then -v_lp_loss else 0 end,
    v_l_before, v_l_after, v_l_level_before, v_l_level_after,
    ca_rank_title_for_level(v_l_level_before), ca_rank_title_for_level(v_l_level_after),
    ca_rank_title_for_level(v_l_level_before), ca_rank_title_for_level(v_l_level_after),
    v_reason, v_match.room_code, now()
  )
  on conflict (match_id, player_id) where match_id is not null do nothing;

  update matches
  set lp_settled = true,
      settled_at = coalesce(settled_at, now()),
      settlement_status = 'settled',
      finished_at = coalesce(finished_at, now()),
      finish_reason = v_reason
  where id = p_match_id;

  return jsonb_build_object(
    'lp_gain', v_lp_gain,
    'lp_loss', v_lp_loss,
    'winner_lp', v_w_after,
    'loser_lp', v_l_after,
    'already_settled', v_match.lp_settled
  );
end;
$$;
