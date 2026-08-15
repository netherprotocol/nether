# NDR-0009: Emit revert data when strategy deposit-on-bury fails

- Status: Accepted
- Date: 2026-08-15
- Supersedes: (none)
- Superseded by: (none)

This record is **accepted**. When `bury()` catches a reverting `depositETH`, Grave MUST emit `StrategyDepositFailed` with the adapter’s revert data. Burial still succeeds and ETH stays idle ([`NDR-0005`](0005-strategy-security.md)).

## Context

[`NDR-0005`](0005-strategy-security.md) and [`NIP-0006`](../nip/0006-strategy.md) §6.2 require `bury()` to complete when the active adapter’s `depositETH` reverts: mint and principal accounting stay, ETH remains idle on Grave. There is no Grave pause, so a dead adapter must not brick burial.

The implementation used an empty `catch {}`. That preserves burial, but it discards the revert payload. On Base Sepolia, `bury()` succeeded while the nested `depositETH` → WETH `deposit()` trace reverted, with no Grave event explaining why. Spec §13’s minimum event list covers issuance and Reaper reconstruction; it does not say how a swallowed strategy-deposit failure is observed. [`NIP-0006`](../nip/0006-strategy.md) only required leaving ETH idle.

## Decision drivers

- Do not revert `bury()` when `depositETH` fails ([`NDR-0005`](0005-strategy-security.md)).
- Make adapter-deposit failures observable on-chain from Grave logs, including custom-error selectors, without relying on an explorer trace.
- Do not change `IStrategyAdapter`, add `deployIdle()`, or store a last-error slot.
- Do not add this event to spec §13’s minimum list (issuance and Reaper reconstruction do not need it).

## Options

### Option A: Empty `catch {}` (status quo)

`bury()` succeeds and ETH stays idle. Revert data exists only in the transaction trace. Operators cannot filter Grave logs for failed deposits.

### Option B: Emit `StrategyDepositFailed` with revert bytes (chosen)

Keep the try/catch. On success, emit `StrategyDeposit` as today. On revert, emit `StrategyDepositFailed(strategy, ethAmount, reason)` where `reason` is the ABI-encoded revert data from `catch (bytes memory reason)` (custom errors, `Error(string)`, `Panic(uint256)`, or empty).

### Option C: Let `depositETH` revert `bury()`

The failure is then the transaction status. A paused, capped, or broken adapter DoS-es burial until a 14-day migration completes, which [`NDR-0005`](0005-strategy-security.md) forbids.

### Option D: Low-level `call` and cap copied returndata

Replace try/catch with `address.call`, copy a bounded prefix of returndata, emit that. Bounds gas if a malicious adapter returns huge revert data. More assembly and a new copy rule on an immutable Grave path. Solidity try/catch already copies returndata into the catch clause.

### Option E: Store the last revert in storage

A `lastDepositFailure` slot that anyone can read. Extra Grave state, overwrite on the next bury, and still needs an event if indexers should notice.

### Option F: Also emit for migration withdraw and NAV snapshot catches

`executeStrategyMigration` already best-effort catches old-adapter `withdrawETH` / `totalAssetsInETH`. Those are owner-called, not the permissionless bury path. First-adapter `depositETH` on execute is *not* try/caught (revert undoes the slot write). Out of scope for this record.

## Decision

Chosen option: **Option B**, because it is the smallest change that keeps burial live and puts the adapter’s revert payload in Grave logs.

- Option A is the deployed bug: traces show the revert, Grave events do not.
- Option C reopens the pause-less DoS [`NDR-0005`](0005-strategy-security.md) closed.
- Option D can supersede this record if huge returndata on `depositETH` is observed as a bury-gas problem; it is not required to make ordinary custom errors visible.
- Option E adds state without helping log consumers.
- Option F is a separate observability choice for owner migration, not bury-on-deposit.

Event (not in spec §13’s minimum list; same extra-event class as `ReaperSet`):

```text
event StrategyDepositFailed(address indexed strategy, uint256 ethAmount, bytes reason);
```

`catch (bytes memory reason)` is the single catch clause so custom errors are not dropped by an `Error(string)`-only catch.

## Consequences

- `Grave._deployIdle` emits `StrategyDepositFailed` instead of an empty catch. `StrategyDeposit` is unchanged on success.
- [`NIP-0006`](../nip/0006-strategy.md) documents the event and the bury test that expects it.
- Unit tests must assert the event payload matches the adapter’s revert encoding.
- A later indexer or keeper MAY watch `StrategyDepositFailed`; none is required by this record.
- Huge adapter returndata can raise `bury()` gas (try/catch copy plus the log). That copy already existed. A returndata cap would need a superseding NDR (Option D).
- What would trigger a superseding NDR: reverting `bury()` on deposit failure; bounding or hashing revert data; writing failure state; or emitting the same event from migration execute.
