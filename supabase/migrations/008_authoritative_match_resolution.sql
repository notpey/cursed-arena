alter table public.matches
  add column if not exists match_revision bigint not null default 0,
  add column if not exists last_submission_id text,
  add column if not exists last_submission_player_id uuid references auth.users(id);

alter table public.match_commands
  add column if not exists submission_id text,
  add column if not exists action_order jsonb,
  add column if not exists command_source text not null default 'client';

update public.match_commands
set submission_id = coalesce(submission_id, id::text)
where submission_id is null;

alter table public.match_commands
  alter column submission_id set not null;

create unique index if not exists match_commands_submission_id_idx
  on public.match_commands (match_id, submission_id);
