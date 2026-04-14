-- ============================================================
-- Cursed Arena — Multiplayer schema
-- Run this in your Supabase SQL editor or via the CLI.
-- ============================================================

-- --------------------------------------------------------
-- Matchmaking queue
-- One row per player actively searching for a match.
-- --------------------------------------------------------
create table if not exists public.matchmaking_queue (
  id            uuid        primary key default gen_random_uuid(),
  player_id     uuid        not null references auth.users(id) on delete cascade,
  mode          text        not null check (mode in ('ranked', 'quick', 'private')),
  team_ids      text[]      not null,
  display_name  text        not null default '',
  lp            integer     not null default 0,
  created_at    timestamptz not null default now(),

  -- One active queue entry per player at a time
  unique (player_id)
);

-- --------------------------------------------------------
-- Matches
-- One row per live or finished match.
-- player_a is always 'player' in the stored BattleState.
-- player_b is always 'enemy' in the stored BattleState.
-- --------------------------------------------------------
create table if not exists public.matches (
  id                    uuid        primary key default gen_random_uuid(),
  mode                  text        not null check (mode in ('ranked', 'quick', 'private')),
  status                text        not null default 'in_progress'
                                    check (status in ('waiting', 'in_progress', 'finished', 'abandoned')),
  seed                  text        not null,

  -- Players
  player_a_id           uuid        not null references auth.users(id),
  player_b_id           uuid        references auth.users(id),   -- null while waiting for opponent
  player_a_display_name text        not null default '',
  player_b_display_name text        not null default '',

  -- Fighter template IDs
  player_a_team         text[]      not null default '{}',
  player_b_team         text[]      not null default '{}',

  -- Full BattleState as JSON (canonical: a=player, b=enemy)
  battle_state          jsonb,

  -- Denormalized for fast reads and RLS decisions
  current_phase         text        not null default 'coinFlip',
  current_round         integer     not null default 1,
  active_player         text        not null default 'player'
                                    check (active_player in ('player', 'enemy')),
  winner                text        check (winner in ('player', 'enemy')),

  -- Private match room code (null for queue-matched games)
  room_code             text        unique,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- --------------------------------------------------------
-- Match commands
-- One row per player per turn-phase per round.
-- The active player writes here; the hook reads this to
-- resolve their turn and write the new BattleState back.
-- --------------------------------------------------------
create table if not exists public.match_commands (
  id         uuid        primary key default gen_random_uuid(),
  match_id   uuid        not null references public.matches(id) on delete cascade,
  player_id  uuid        not null references auth.users(id),
  round      integer     not null,
  -- 'firstPlayerCommand' | 'secondPlayerCommand'
  phase      text        not null check (phase in ('firstPlayerCommand', 'secondPlayerCommand')),
  -- Record<instanceId, QueuedBattleAction> — canonical perspective (a=player, b=enemy)
  commands   jsonb       not null,
  created_at timestamptz not null default now(),

  unique (match_id, player_id, round, phase)
);

-- --------------------------------------------------------
-- Indexes
-- --------------------------------------------------------
create index if not exists matches_player_a_idx         on public.matches (player_a_id);
create index if not exists matches_player_b_idx         on public.matches (player_b_id);
create index if not exists matches_status_mode_idx      on public.matches (status, mode);
create index if not exists matches_room_code_idx        on public.matches (room_code) where room_code is not null;
create index if not exists match_commands_match_idx     on public.match_commands (match_id);
create index if not exists matchmaking_queue_mode_idx   on public.matchmaking_queue (mode, created_at);

-- --------------------------------------------------------
-- updated_at trigger
-- --------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_updated_at on public.matches;
create trigger matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------
alter table public.matchmaking_queue  enable row level security;
alter table public.matches            enable row level security;
alter table public.match_commands     enable row level security;

-- matchmaking_queue ---
-- Players manage only their own entry; all authenticated users can read the queue
-- (needed so the client can find an opponent row to pair with).
create policy "queue: own entry full access"
  on public.matchmaking_queue for all
  using  (auth.uid() = player_id)
  with check (auth.uid() = player_id);

create policy "queue: authenticated can read all"
  on public.matchmaking_queue for select
  using (auth.role() = 'authenticated');

-- matches ---
-- Players can read any match they are part of.
create policy "matches: participants can read"
  on public.matches for select
  using (auth.uid() = player_a_id or auth.uid() = player_b_id);

-- Players can create a match where they are player_a.
create policy "matches: player_a can create"
  on public.matches for insert
  with check (auth.uid() = player_a_id);

-- Either participant can update (submit state, set winner, etc.)
create policy "matches: participants can update"
  on public.matches for update
  using (auth.uid() = player_a_id or auth.uid() = player_b_id);

-- match_commands ---
-- A player can insert their own commands for a match they're in.
create policy "commands: participant can insert own"
  on public.match_commands for insert
  with check (
    auth.uid() = player_id
    and exists (
      select 1 from public.matches
      where id = match_id
        and (player_a_id = auth.uid() or player_b_id = auth.uid())
    )
  );

-- Either participant can read all commands for their match.
create policy "commands: participants can read"
  on public.match_commands for select
  using (
    exists (
      select 1 from public.matches
      where id = match_id
        and (player_a_id = auth.uid() or player_b_id = auth.uid())
    )
  );

-- --------------------------------------------------------
-- Enable Realtime for the matches table
-- (run this separately if Realtime is not already enabled)
-- --------------------------------------------------------
-- alter publication supabase_realtime add table public.matches;
-- alter publication supabase_realtime add table public.match_commands;
