# NDR-0008: Immediate first strategy activation

- Status: Accepted
- Date: 2026-08-15
- Supersedes: (none)
- Superseded by: (none)

This record is **accepted**. While no adapter is active (`activeStrategy == address(0)`), the owner MAY execute a scheduled strategy immediately. Replacing an already-active adapter still requires the 14-day delay.

## Context

Spec §6.5 / §10.2 / §21 require a 14-day public timelock for strategy **replacement**. [`NIP-0006`](../nip/0006-strategy.md) applied that delay to the first adapter as well (migration from `address(0)`). Launch on Base Sepolia and mainnet then cannot put buried ETH into Aave until two weeks after `scheduleStrategy`.

`setGrave` and `setReaper` are already one-time setup that take effect immediately. The first adapter is the same kind of setup: there is no live venue to steal from yet. Once an adapter is active, replacement can move protected principal, so the 14-day notice window still applies.

## Decision drivers

- Keep the 14-day public delay for replacing a live adapter (spec §6.5, [`NDR-0005`](0005-strategy-security.md)).
- Allow a fully wired family, including a live initial adapter, at deploy time.
- Do not add a second strategy-admin function or skip scheduling.
- Do not let a later replacement bypass the delay.

## Options

### Option A: First adapter also waits 14 days (status quo)

`executeStrategyMigration` always requires `block.timestamp >= executeAfter`. Sepolia and mainnet sit idle for two weeks after schedule. Matches [`NIP-0006`](../nip/0006-strategy.md) as written.

### Option B: Skip the delay only while no adapter is active (chosen)

`scheduleStrategy` is unchanged (`executeAfter = now + 14 days`). `executeStrategyMigration` skips the timestamp check when `activeStrategy == address(0)`. Cancel still works before execute. Any later schedule, when an adapter is already live, waits the full 14 days.

### Option C: One-time `setInitialStrategy`

A dedicated setter, like `setReaper`, writes `activeStrategy` once and then locks. Extra surface next to `schedule` / `cancel` / `execute`.

### Option D: `scheduleStrategy` activates immediately when unset

One transaction, no pending slot for the first adapter. No cancel window between schedule and execute for that first set.

## Decision

Chosen option: **Option B**, because it is the smallest change that matches “set immediately when strategy address is 0”: the existing two-step API stays, the first execute can happen in the same deploy run, and replacement delay is untouched.

- Option A blocks yield until two weeks after launch.
- Option C adds a second way to set the adapter.
- Option D removes cancel for the first schedule.

`activeStrategy` cannot return to `address(0)` after the first execute (`scheduleStrategy` rejects a zero adapter), so the skip cannot be reused for a later replacement.

## Consequences

- Grave `executeStrategyMigration` does not revert `StrategyDelayNotElapsed` when `activeStrategy == address(0)`.
- Spec §6.5 / §10.2 / §21 and [`NIP-0006`](../nip/0006-strategy.md) are updated to this rule.
- Tests that required a warp before the first execute must execute immediately (or still warp; warping remains valid). Replacement tests still warp 14 days.
- The deploy script may call `executeStrategyMigration` in the same run as `scheduleStrategy` for the initial adapter.
- What would trigger a superseding NDR: skipping the delay while an adapter is already active; adding `setInitialStrategy`; or activating inside `scheduleStrategy` with no pending slot.
