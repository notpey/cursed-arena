# Authoritative Multiplayer Resolution Contract

## Purpose
This document defines the target contract for server-authoritative multiplayer turn resolution.

It replaces the current model where:
- the active client resolves the turn locally
- the client writes the resulting `battle_state`
- the opponent accepts the written result as truth

That model is serviceable for prototyping, but it is not good enough for Naruto-Arena-level match integrity.

## Current Problem
The current online flow is:

1. active client builds commands locally
2. active client runs `resolveTeamTurnTimeline`
3. active client writes:
   - `battle_state`
   - `resolution_id`
   - `resolution_steps`
4. opponent replays what the active client wrote

This improves playback, but it does not create authority.

The authoritative model must make the backend, not the active client, the final arbiter of:
- command validity
- turn ordering
- cost spending
- state transitions
- replay generation

## Contract Goals
- one canonical turn result
- deterministic replay payload for both clients
- safe duplicate-submit handling
- safe reconnect handling
- optimistic UI support without allowing client authority

## Terms
- `canonical`: stored from player A / player B database perspective
- `local`: remapped so each client sees themselves as `player`
- `match_revision`: monotonically increasing version for concurrency control
- `submission_id`: idempotency key for one command submission attempt
- `resolution_id`: canonical id for one resolved turn payload

## Required Backend Responsibilities
The backend resolution endpoint or function must:

1. authenticate the caller
2. load the current match row
3. verify the caller belongs to the match
4. verify the match is still resolvable
5. verify the caller is the active player for the current phase
6. verify the submission is for the current `round` and `phase`
7. reject stale `match_revision`
8. persist raw submitted commands
9. resolve the turn canonically
10. write the canonical next state and canonical replay payload
11. increment `match_revision`
12. return the canonical resolution response

## Database Contract

### Existing Fields Used
- `matches.id`
- `matches.status`
- `matches.battle_state`
- `matches.current_phase`
- `matches.current_round`
- `matches.active_player`
- `matches.winner`
- `matches.resolution_id`
- `matches.resolution_steps`
- `matches.last_activity_at`

### New Required Fields
Add to `matches`:
- `match_revision bigint not null default 0`
- `last_submission_id text null`
- `last_submission_player_id uuid null`

Add to `match_commands`:
- `submission_id text not null`
- `action_order jsonb null`
- `command_source text not null default 'client'`
- unique constraint on `(match_id, submission_id)`

## Request Contract

### Endpoint Shape
Recommended:
- Supabase Edge Function: `submit-match-turn`

### Request Body
```ts
type SubmitMatchTurnRequest = {
  matchId: string
  submissionId: string
  expectedRevision: number
  round: number
  phase: 'firstPlayerCommand' | 'secondPlayerCommand'
  commands: Record<string, QueuedBattleAction>
  actionOrder: string[]
}
```

### Request Rules
- `commands` must already be canonical perspective
- `actionOrder` must contain canonical actor ids
- the server does not trust client-side affordability or legality checks
- omitted fighters are treated as pass only if that is an explicit server rule

## Response Contract

### Success Body
```ts
type SubmitMatchTurnSuccess = {
  ok: true
  matchId: string
  revision: number
  resolution: {
    resolutionId: string
    round: number
    phase: 'firstPlayerCommand' | 'secondPlayerCommand'
    source: 'server'
    steps: BattleTimelineStep[]
    finalState: BattleState
  }
  status: 'in_progress' | 'finished' | 'abandoned'
}
```

### Reject Body
```ts
type SubmitMatchTurnReject = {
  ok: false
  code:
    | 'MATCH_NOT_FOUND'
    | 'NOT_PARTICIPANT'
    | 'MATCH_NOT_ACTIVE'
    | 'NOT_YOUR_TURN'
    | 'STALE_REVISION'
    | 'STALE_PHASE'
    | 'INVALID_COMMANDS'
    | 'ALREADY_SUBMITTED'
    | 'INTERNAL_ERROR'
  message: string
  latestRevision?: number
  latestState?: BattleState
}
```

## Idempotency Rules
- the client must send a `submissionId` per submit attempt
- if the same `submissionId` is received again for the same match, the backend must return the already-produced result
- duplicate requests must not resolve the same turn twice

## Match Revision Rules
- every successful authoritative turn increments `match_revision`
- the client must submit `expectedRevision`
- stale revision means the client is operating on old state and must resync

## Replay Rules
- `resolution_steps` must be backend-authored
- clients may optimistically render local intent, but not optimistic final truth
- reconnecting clients should trust the returned `battle_state` and `resolution_steps`

## Client Responsibilities After Contract Migration

### Client Must Still Do
- build local queue state
- display target legality
- display projected affordability
- send canonicalized commands
- play returned replay steps

### Client Must Stop Doing
- resolving online turns as final truth
- writing `battle_state` directly for live multiplayer turns
- generating authoritative `resolution_steps`

## Migration Plan

### Phase A: Contract and Types
- add protocol types in `src/features/multiplayer/protocol.ts`
- add this document
- add `match_revision` schema planning

### Phase B: Backend Function
- create `submit-match-turn` edge function
- move canonical online turn resolution there
- return authoritative resolution payload

### Phase C: Client Integration
- replace `commitMatchState` usage inside live multiplayer submit flow
- keep local optimistic UI limited to pending/locked state
- use server response to update local canonical state

### Phase D: Cleanup
- mark direct client-side multiplayer commit path as legacy
- keep direct local engine resolution for AI / offline only

## Non-Goals
This contract does not yet cover:
- LP/rank changes
- rematch negotiation
- spectator mode
- anti-cheat beyond turn-authority basics

## Acceptance Criteria
The contract is complete when:
- clients no longer write final multiplayer battle truth directly
- duplicate submits cannot create duplicate resolutions
- stale clients are rejected cleanly
- reconnect replay is canonical
- online matches use the same authoritative result on both ends
