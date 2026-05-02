-- Live-system persistence for clans, avatars, ladder views, and experience settlement.

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists experience integer not null default 0,
  add column if not exists matches_played integer not null default 0;

update public.profiles
set experience = lp
where experience = 0 and lp > 0;

alter table public.matchmaking_queue
  add column if not exists experience integer not null default 0;

update public.matchmaking_queue
set experience = lp
where experience = 0 and lp > 0;

create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null unique,
  description text not null default '',
  leader_id uuid references auth.users(id) not null,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  recruitment_status text not null default 'open' check (recruitment_status in ('open', 'invite-only', 'closed')),
  avatar_url text null,
  style_preset text null,
  accent_color text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clan_members (
  clan_id uuid references public.clans(id) on delete cascade,
  player_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'officer', 'member')),
  joined_at timestamptz not null default now(),
  primary key (clan_id, player_id),
  unique (player_id)
);

create table if not exists public.clan_invitations (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid references public.clans(id) on delete cascade not null,
  invited_player_id uuid references auth.users(id) on delete cascade not null,
  invited_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz null
);

create index if not exists clans_visibility_created_idx on public.clans (visibility, created_at desc);
create index if not exists clan_members_clan_idx on public.clan_members (clan_id);
create index if not exists clan_invitations_invited_idx on public.clan_invitations (invited_player_id, status, created_at desc);

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_invitations enable row level security;

create policy "clans_read_public_or_member"
  on public.clans for select
  using (
    visibility = 'public'
    or auth.uid() = leader_id
    or exists (
      select 1 from public.clan_members cm
      where cm.clan_id = clans.id and cm.player_id = auth.uid()
    )
  );

create policy "clans_insert_when_clanless"
  on public.clans for insert
  with check (
    auth.uid() = leader_id
    and not exists (select 1 from public.clan_members cm where cm.player_id = auth.uid())
  );

create policy "clans_update_leader"
  on public.clans for update
  using (auth.uid() = leader_id)
  with check (auth.uid() = leader_id);

create policy "clan_members_read_visible"
  on public.clan_members for select
  using (
    exists (
      select 1 from public.clans c
      where c.id = clan_members.clan_id
        and (
          c.visibility = 'public'
          or c.leader_id = auth.uid()
          or exists (
            select 1 from public.clan_members mine
            where mine.clan_id = c.id and mine.player_id = auth.uid()
          )
        )
    )
  );

create policy "clan_members_insert_open_self_or_leader"
  on public.clan_members for insert
  with check (
    not exists (select 1 from public.clan_members mine where mine.player_id = auth.uid())
    and (
      (player_id = auth.uid() and role = 'member' and exists (
        select 1 from public.clans c
        where c.id = clan_members.clan_id and c.recruitment_status = 'open'
      ))
      or
      (player_id = auth.uid() and role = 'leader' and exists (
        select 1 from public.clans c
        where c.id = clan_members.clan_id and c.leader_id = auth.uid()
      ))
    )
  );

create policy "clan_members_delete_self_not_leader"
  on public.clan_members for delete
  using (player_id = auth.uid() and role <> 'leader');

create policy "clan_invitations_read_own_or_clan_leadership"
  on public.clan_invitations for select
  using (
    invited_player_id = auth.uid()
    or exists (
      select 1 from public.clan_members cm
      where cm.clan_id = clan_invitations.clan_id
        and cm.player_id = auth.uid()
        and cm.role in ('leader', 'officer')
    )
  );

create policy "clan_invitations_update_own"
  on public.clan_invitations for update
  using (invited_player_id = auth.uid())
  with check (invited_player_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('player-avatars', 'player-avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('clan-avatars', 'clan-avatars', true)
on conflict (id) do nothing;

create policy "player_avatars_read_public"
  on storage.objects for select
  using (bucket_id = 'player-avatars');

create policy "player_avatars_write_own_folder"
  on storage.objects for insert
  with check (bucket_id = 'player-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "player_avatars_update_own_folder"
  on storage.objects for update
  using (bucket_id = 'player-avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'player-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "clan_avatars_read_public"
  on storage.objects for select
  using (bucket_id = 'clan-avatars');

create policy "clan_avatars_write_leader_or_officer"
  on storage.objects for insert
  with check (
    bucket_id = 'clan-avatars'
    and exists (
      select 1 from public.clan_members cm
      where cm.clan_id::text = (storage.foldername(name))[1]
        and cm.player_id = auth.uid()
        and cm.role in ('leader', 'officer')
    )
  );

create policy "clan_avatars_update_leader_or_officer"
  on storage.objects for update
  using (
    bucket_id = 'clan-avatars'
    and exists (
      select 1 from public.clan_members cm
      where cm.clan_id::text = (storage.foldername(name))[1]
        and cm.player_id = auth.uid()
        and cm.role in ('leader', 'officer')
    )
  )
  with check (
    bucket_id = 'clan-avatars'
    and exists (
      select 1 from public.clan_members cm
      where cm.clan_id::text = (storage.foldername(name))[1]
        and cm.player_id = auth.uid()
        and cm.role in ('leader', 'officer')
    )
  );

create or replace view public.sorcerer_ladder_view as
select
  p.id as player_id,
  coalesce(p.display_name, 'Sorcerer') as display_name,
  p.avatar_url,
  coalesce(nullif(p.experience, 0), p.lp, 0) as experience,
  coalesce(p.wins, 0) as wins,
  coalesce(p.losses, 0) as losses,
  coalesce(p.win_streak, 0) as win_streak,
  coalesce(p.best_streak, 0) as best_streak,
  cm.clan_id,
  c.name as clan_name,
  c.tag as clan_tag,
  c.avatar_url as clan_avatar_url
from public.profiles p
left join public.clan_members cm on cm.player_id = p.id
left join public.clans c on c.id = cm.clan_id;

create or replace view public.clan_ladder_view as
with member_scores as (
  select
    c.id as clan_id,
    c.name as clan_name,
    c.tag as clan_tag,
    c.avatar_url as clan_avatar_url,
    cm.player_id,
    coalesce(p.display_name, 'Sorcerer') as display_name,
    p.avatar_url,
    coalesce(nullif(p.experience, 0), p.lp, 0) as experience,
    coalesce(p.wins, 0) as wins,
    coalesce(p.losses, 0) as losses,
    row_number() over (partition by c.id order by coalesce(nullif(p.experience, 0), p.lp, 0) desc) as score_rank
  from public.clans c
  join public.clan_members cm on cm.clan_id = c.id
  left join public.profiles p on p.id = cm.player_id
),
clan_rollup as (
  select
    clan_id,
    clan_name,
    clan_tag,
    clan_avatar_url,
    count(*)::integer as member_count,
    count(*)::integer as active_member_count,
    sum(case when score_rank <= 10 then experience else 0 end)::integer as clan_score,
    round(avg(public.ca_level_for_experience(experience)))::integer as average_level,
    (array_agg(player_id order by experience desc))[1] as top_player_id,
    (array_agg(display_name order by experience desc))[1] as top_display_name,
    (array_agg(avatar_url order by experience desc))[1] as top_avatar_url,
    (array_agg(experience order by experience desc))[1] as top_experience,
    (array_agg(wins order by experience desc))[1] as wins,
    (array_agg(losses order by experience desc))[1] as losses
  from member_scores
  group by clan_id, clan_name, clan_tag, clan_avatar_url
)
select
  *,
  dense_rank() over (order by clan_score desc, member_count desc, clan_name asc)::integer as ladder_rank
from clan_rollup;

create or replace function public.settle_match_experience(p_match_id uuid)
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
  v_gain integer := 25;
  v_loss integer := 20;
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
  if not found then return jsonb_build_object('error', 'match not found'); end if;
  if auth.uid() != v_match.player_a_id and auth.uid() != v_match.player_b_id then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  if v_match.status = 'abandoned' then return jsonb_build_object('error', 'abandoned matches are not counted'); end if;
  if v_match.status != 'finished' then return jsonb_build_object('error', 'match not finished'); end if;
  if v_match.winner is null then return jsonb_build_object('error', 'finished match has no winner'); end if;
  if v_match.lp_settled then
    return jsonb_build_object('experience_gain', 0, 'experience_loss', 0, 'winner_experience', null, 'loser_experience', null, 'already_settled', true);
  end if;
  if v_match.winner = 'draw' then
    update matches set lp_settled = true, settled_at = coalesce(settled_at, now()), settlement_status = 'settled', finished_at = coalesce(finished_at, now()), finish_reason = coalesce(finish_reason, 'ko') where id = p_match_id;
    return jsonb_build_object('experience_gain', 0, 'experience_loss', 0, 'winner_experience', null, 'loser_experience', null, 'draw', true);
  end if;

  if v_match.winner = 'player' then
    v_winner_id := v_match.player_a_id; v_loser_id := v_match.player_b_id;
    v_winner_name := v_match.player_a_display_name; v_loser_name := v_match.player_b_display_name;
    v_winner_team := v_match.player_a_team; v_loser_team := v_match.player_b_team;
  else
    v_winner_id := v_match.player_b_id; v_loser_id := v_match.player_a_id;
    v_winner_name := v_match.player_b_display_name; v_loser_name := v_match.player_a_display_name;
    v_winner_team := v_match.player_b_team; v_loser_team := v_match.player_a_team;
  end if;
  if v_loser_id is null then return jsonb_build_object('error', 'match missing loser'); end if;

  select coalesce(nullif(experience, 0), lp, 0) into v_w_before from profiles where id = v_winner_id for update;
  select coalesce(nullif(experience, 0), lp, 0) into v_l_before from profiles where id = v_loser_id for update;
  v_w_level_before := public.ca_level_for_experience(v_w_before);
  v_l_level_before := public.ca_level_for_experience(v_l_before);
  v_gain := greatest(10, least(50, 25 + ((v_l_level_before - v_w_level_before) * 2)));
  v_loss := greatest(5, least(40, 20 + ((v_w_level_before - v_l_level_before) * 2)));

  if v_match.mode = 'ranked' then
    v_w_after := greatest(0, v_w_before + v_gain);
    v_l_after := greatest(0, v_l_before - v_loss);
    update profiles set experience = v_w_after, lp = v_w_after, wins = wins + 1, matches_played = matches_played + 1, win_streak = win_streak + 1, best_streak = greatest(best_streak, win_streak + 1) where id = v_winner_id;
    update profiles set experience = v_l_after, lp = v_l_after, losses = losses + 1, matches_played = matches_played + 1, win_streak = 0 where id = v_loser_id;
  else
    v_w_after := v_w_before;
    v_l_after := v_l_before;
  end if;

  v_w_level_after := public.ca_level_for_experience(v_w_after);
  v_l_level_after := public.ca_level_for_experience(v_l_after);
  v_reason := coalesce(v_match.finish_reason, 'ko');

  insert into public.match_history (id, match_id, player_id, result, mode, opponent_name, opponent_title, your_team, their_team, rounds, lp_delta, experience_delta, experience_before, experience_after, level_before, level_after, rank_before, rank_after, rank_title_before, rank_title_after, finish_reason, room_code, played_at)
  values (p_match_id::text || ':' || v_winner_id::text, p_match_id, v_winner_id, 'WIN', v_match.mode, coalesce(v_loser_name, 'Opponent'), 'Online Match', v_winner_team, v_loser_team, v_match.current_round, case when v_match.mode = 'ranked' then v_gain else 0 end, case when v_match.mode = 'ranked' then v_gain else 0 end, v_w_before, v_w_after, v_w_level_before, v_w_level_after, public.ca_rank_title_for_level(v_w_level_before), public.ca_rank_title_for_level(v_w_level_after), public.ca_rank_title_for_level(v_w_level_before), public.ca_rank_title_for_level(v_w_level_after), v_reason, v_match.room_code, now())
  on conflict (match_id, player_id) where match_id is not null do nothing;

  insert into public.match_history (id, match_id, player_id, result, mode, opponent_name, opponent_title, your_team, their_team, rounds, lp_delta, experience_delta, experience_before, experience_after, level_before, level_after, rank_before, rank_after, rank_title_before, rank_title_after, finish_reason, room_code, played_at)
  values (p_match_id::text || ':' || v_loser_id::text, p_match_id, v_loser_id, 'LOSS', v_match.mode, coalesce(v_winner_name, 'Opponent'), 'Online Match', v_loser_team, v_winner_team, v_match.current_round, case when v_match.mode = 'ranked' then -v_loss else 0 end, case when v_match.mode = 'ranked' then -v_loss else 0 end, v_l_before, v_l_after, v_l_level_before, v_l_level_after, public.ca_rank_title_for_level(v_l_level_before), public.ca_rank_title_for_level(v_l_level_after), public.ca_rank_title_for_level(v_l_level_before), public.ca_rank_title_for_level(v_l_level_after), v_reason, v_match.room_code, now())
  on conflict (match_id, player_id) where match_id is not null do nothing;

  update matches set lp_settled = true, settled_at = coalesce(settled_at, now()), settlement_status = 'settled', finished_at = coalesce(finished_at, now()), finish_reason = v_reason where id = p_match_id;
  return jsonb_build_object('experience_gain', v_gain, 'experience_loss', v_loss, 'winner_experience', v_w_after, 'loser_experience', v_l_after, 'already_settled', false);
end;
$$;

create or replace function public.settle_match_lp(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.settle_match_experience(p_match_id);
  return jsonb_build_object(
    'lp_gain', coalesce((v_result->>'experience_gain')::integer, 0),
    'lp_loss', coalesce((v_result->>'experience_loss')::integer, 0),
    'winner_lp', nullif(v_result->>'winner_experience', '')::integer,
    'loser_lp', nullif(v_result->>'loser_experience', '')::integer,
    'already_settled', coalesce((v_result->>'already_settled')::boolean, false),
    'error', v_result->>'error',
    'draw', coalesce((v_result->>'draw')::boolean, false)
  );
end;
$$;
