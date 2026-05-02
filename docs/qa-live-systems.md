# Live Systems QA Checklist

Use this checklist after applying Supabase migrations in a test project.

## Battle And Results

- Log in as Player A and Player B in separate browsers.
- Start a ranked ladder search with both players.
- Confirm `/battle/:matchId` shows loading until the server match loads, not a local practice battle.
- Finish one match by KO and verify both players get one `match_history` row with the same `match_id`.
- Start another ranked match and surrender from Player A.
- Verify Player A sees LOSS and Player B sees WIN.
- Verify `profiles.experience`, `wins`, `losses`, `matches_played`, and streak fields changed once.
- Refresh `/battle/results` for each player and verify the same server result appears without duplicate history rows.
- Open an abandoned match URL and verify it cannot render the playable battle board.
- Open a finished match URL and verify it routes to a non-playable finished/results state.

## Matchmaking Cleanup

- Start a ladder search, cancel, and restart.
- Verify old polling does not navigate into an old match.
- Verify stale `matchmaking_queue` rows are ignored.
- Use the ACP/player reset flow if available and confirm it abandons active cleanup matches without creating history.

## Clans

- Create a clan while logged in.
- Refresh the browser and verify the clan persists.
- Log in as another user and confirm the public clan appears in `/clans`.
- Join the open clan and refresh.
- Verify the joining user cannot create or join another clan.
- Verify the leader cannot leave without transfer/disband.
- Verify `/clans/:clanId` shows real members and server profile stats.
- Verify a user only sees invitations where `invited_player_id` matches their auth id.

## Avatars

- Upload a PNG/JPEG/WebP player avatar under 2 MB.
- Upload a GIF player avatar under 5 MB.
- Refresh and verify `profiles.avatar_url` persists.
- Upload a clan avatar as clan leader/officer.
- Refresh and verify `clans.avatar_url` persists.
- Temporarily point to a project missing the Storage buckets and verify upload shows a clear bucket error instead of fake success.

## Ladders

- Open Sorcerer Ladder and verify rows show real `profiles.avatar_url`, wins/losses, streak, and clan tags.
- Verify Rank #1 with Level 46+ shows `The Strongest`.
- Open Clan Ladder and verify clans are ranked by top 10 member experience, not unlimited total roster size.
- Join a clan with a high-experience account and verify the clan score changes after refresh.

## Known Manual Areas

- Matchmaking pairing is still client-orchestrated. A server RPC should eventually own the full queue transaction, but that RPC needs the client-generated battle state or an equivalent server-side battle state builder.
