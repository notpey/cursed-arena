# Naruto-Arena Fidelity Audit

This audit tracks where Cursed-Arena follows Naruto-Arena-style expectations and where it intentionally differs.

## Turn Structure

| Behavior | Cursed-Arena implementation | Fidelity | Status |
| --- | --- | --- | --- |
| Full-team turns | The active side queues actions for all living commandable fighters. | Same spirit | Covered by battle engine tests. |
| Manual action ordering | Players can manually order queued actions. | Intentional difference | Do not change without a product decision. |
| Speed order | No speed-based action order. | Same spirit | Existing engine behavior. |

## Energy

| Behavior | Cursed-Arena implementation | Fidelity | Status |
| --- | --- | --- | --- |
| Opening energy | Opening player starts with 1 energy; second player gets normal living-team distribution. | Same spirit | Covered by `initial energy gives the opening player 1`. |
| Round refresh | Energy refresh uses living fighter count. | Same spirit | Covered by engine tests and selectors. |
| Random energy spend | Random costs can be allocated and spend from declared pools. | Same spirit | Covered by `random energy allocation on queued commands`. |

## Durations

| Behavior | Cursed-Arena implementation | Fidelity | Status |
| --- | --- | --- | --- |
| Stun duration | Stuns persist through the victim's next action window. | Same spirit | Covered by duration tests. |
| Class stun duration | Class stuns skip the round they were applied so one turn means one victim turn. | Same spirit | Covered by class stun tests. |
| Cooldowns | Cooldowns tick through round progression. | Same spirit | Covered by existing engine tests. |

## Targeting

| Behavior | Cursed-Arena implementation | Fidelity | Status |
| --- | --- | --- | --- |
| Single enemy/ally | Requires a living valid target. | Same spirit | Covered by target validation. |
| All enemies/all allies | Requires at least one living valid target but queues with no specific `targetId`. | Same spirit | Covered by AoE queueing tests. |
| Self | Targets the acting fighter. | Same spirit | Existing engine behavior. |
| No target | Reserved for pass/no-target commands. | Same spirit | Existing engine behavior. |

## Match Lifecycle

| Behavior | Cursed-Arena implementation | Fidelity | Status |
| --- | --- | --- | --- |
| Surrender | Surrender is a counted finish/forfeit, not cleanup abandon. | Same spirit | Implemented in multiplayer lifecycle. |
| Disconnect claim | Opponent claim finalizes a counted result. | Same spirit | Implemented in multiplayer lifecycle. |
| Abandon | Admin/stale cleanup only; no contest, no rewards. | Cursed-Arena-specific cleanup | Implemented in zombie-match repair pass. |
| Match history | Counted online results are server-authoritative. | Same spirit | Backed by Supabase settlement migration. |

## Skill Class Display

| Behavior | Cursed-Arena implementation | Fidelity | Status |
| --- | --- | --- | --- |
| Display order | Damage Type -> Range -> Action Type -> Other. | Cursed-Arena rule | Covered by content test. |
| Engine meaning | Class membership is order-insensitive for mechanics. | Same spirit | Existing engine behavior. |

## Character Kits

| Behavior | Cursed-Arena implementation | Fidelity | Status |
| --- | --- | --- | --- |
| Nobara Straw Doll Ritual | Ritual damage and healing reduction stack; defense is granted immediately and on round start while active. | Naruto-Arena-inspired | Covered by Nobara behavior tests. |
| Nobara Hairpin | Hairpin hits tagged enemies and increases Nobara's global Ritual damage. | Cursed-Arena interpretation | Text now matches mechanics. |
| Yuji Brink Control | Blocked damage during Brink Control adds transformation HP. | Cursed-Arena interpretation | Covered by Yuji behavior tests. |
| Megumi Shikigami | Shikigami gain is round-start, not every individual action. | Cursed-Arena interpretation | Text now says round. |
| Megumi Nue | Seals non-Mental skills while allowing skills that include Mental. | Naruto-Arena-inspired | Covered by Nue behavior tests. |
