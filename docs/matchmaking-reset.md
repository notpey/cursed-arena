# Matchmaking Reset Notes

Development-only SQL for clearing a stuck user from matchmaking:

```sql
-- Replace with the stuck user's auth id.
delete from matchmaking_queue
where player_id = '<USER_ID>';

update matches
set status = 'abandoned',
    winner = null,
    last_activity_at = now()
where status in ('waiting', 'in_progress')
  and (
    player_a_id = '<USER_ID>'
    or player_b_id = '<USER_ID>'
  );
```

This does not award Experience, mission progress, or match history. Do not delete historical match rows unless you are intentionally resetting development data.
