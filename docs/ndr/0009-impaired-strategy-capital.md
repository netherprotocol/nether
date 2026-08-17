# NDR-0009: Impaired strategy capital after failed migration withdraw

- Status: Accepted
- Date: 2026-08-17
- Supersedes: (none)
- Superseded by: (none)

This record is **accepted**. A strategy migration MUST NOT switch adapters while recoverable ETH still sits in the old venue, until a bounded on-chain retry budget is exhausted. After that budget, leftover capital is marked impaired, left on an on-chain list for permissionless recovery, and excluded from the harvest watermark so Reaper funding on remaining active capital continues. Spec §2 / §6.2 / §6.3 / §6.5 and [`NIP-0006`](../nip/0006-strategy.md) §8.3 must be updated to this rule.

## Context

Spec §6.5 requires withdrawal of all **recoverable** assets from the old adapter, then deposit into the new one, and forbids routing recovered ETH to the multisig. Spec §16.1 requires the protocol to escape a deprecated or reverting adapter. Spec §2 / §6.3 require loss-recovery-first: if `currentNAV < protectedPrincipal`, harvest is zero until NAV is restored.

[`NIP-0006`](../nip/0006-strategy.md) §8.3 implemented escape as best-effort: `executeStrategyMigration` try/catches `withdrawETH`, switches `activeStrategy` anyway, and leaves unpaid ETH in the old adapter. That ETH drops out of `currentNAV` (which is only idle Grave + the **active** adapter). There is no on-chain list of abandoned adapters and no permissionless pull. A later `harvest()` then sees `currentNAV < protectedPrincipal` and withholds all yield until the deficit is filled — including yield on capital that **did** move.

That combination is wrong in two directions at once:

1. A transient venue failure (for example Aave reserve utilization) can strand principal on the first execute, with no retry, and with no in-protocol way to notice or recover it except scheduling that same adapter again (another 14-day delay).
2. If the deficit is then treated as an ordinary strategy loss, Reaper — the protocol’s demand/burn mechanism — stays unfunded until Grave is rebuilt to historical buried size. After a large impairment that can take years, and it disables Reaper in the crisis when it is most needed.

`protectedPrincipal` remains cumulative buried ETH and MUST NOT decrease (spec §2). The missing piece is a separate **impaired** bucket: capital known to be stuck in a former adapter, still recoverable in principle, but no longer part of active Grave capital and no longer a reason to withhold Reaper yield.

This NDR does not reopen burial finality, the 14-day replacement delay, one active adapter (spec §20), or admin `withdraw` of principal to an EOA ([`NDR-0005`](0005-strategy-security.md)).

## Decision drivers

- Do not silently abandon recoverable ETH on the first failed `withdrawETH`.
- Still escape a malicious or bricked adapter that reverts withdraw forever (spec §16.1).
- Prevent the owner from burning the retry budget in one block (migration-spam to force immediate impairment).
- Keep a public, on-chain set of adapters that still **owe** impaired capital so crankers can retry recovery without a new 14-day schedule. An adapter is not forgotten because it currently holds no ETH.
- `protectedPrincipal` never decreases; new `bury()` MUST NOT paper over an impairment.
- Do not withhold future yield from remaining **active** capital in order to refill historical Grave size. Reaper stays funded on yield above the post-impairment watermark.
- Ordinary losses on the **live** adapter remain loss-recovery-first (spec §6.3). Impairment is only the capital left behind in a former adapter after the retry budget is exhausted.
- Recovered ETH is returning principal, not harvestable yield.
- Do not send recovered or migrated ETH to `owner()`.
- Do not add a second simultaneous investing adapter (spec §20). Recovery may pull from a listed former adapter into Grave, then into the single active adapter.
- Crankers should be able to skip a useless `recoverImpaired` by simulating it first, without that skip being treated as repayment or as a reason to drop the adapter.

## Options

### Migration execution

#### Option A: Best-effort switch (status quo)

`executeStrategyMigration` try/catches `withdrawETH` and always writes `activeStrategy = pending`. Unpaid ETH is omitted from NAV. No retry budget, no impaired list, no permissionless recover.

Matches [`NIP-0006`](../nip/0006-strategy.md) §8.3 as implemented. A single transient revert strands capital. Recovery exists only if governance later schedules that same adapter and waits 14 days.

#### Option B: Fail closed with no escape

`executeStrategyMigration` reverts whenever the old `withdrawETH` reverts or pays nothing. Strategy replacement is impossible against a permanently reverting adapter. Violates spec §16.1.

#### Option C: Fail closed by default, owner `force` flag

Normal execute reverts on a failed pull. `executeStrategyMigration(true)` (or a sibling function) performs today’s best-effort switch. The 14-day delay has already elapsed, so force is a hot-path choice with no extra public notice. No retry budget, no list, no dedicated recovery function. Easy to misuse in a panic.

#### Option D: Bounded recorded failures, then impair (chosen)

Keep the pending schedule. Each execute **attempts** to pull all recoverable ETH from the old adapter into Grave.

- If the pull fully succeeds, complete migration: deposit idle ETH into the scheduled adapter, clear pending, clear the failure counter.
- If the pull fails and the failure count for this pending migration is still below `N`, **do not switch** `activeStrategy`. Commit a failed attempt, start a 1-day cooldown, emit a failure event. Pending remains.
- If the pull fails and this attempt is the `N`th failure, complete migration anyway: switch to the scheduled adapter, add the old adapter to the impaired list (or increase its existing owed amount), increase `impairedCapital` as specified below, deposit whatever ETH actually sits on Grave into the new adapter.

`N = 3`. Cooldown between attempts is **1 day**. The first execute of a pending replacement still requires the spec §6.5 14-day delay (or immediate first activation per [`NDR-0008`](0008-initial-strategy-immediate.md) when none is active). After a recorded failure, a retry may run no sooner than `lastFailureTime + 1 day`; it does **not** restart the 14-day clock.

A failed attempt MUST be a **state-changing success**, not a Solidity `revert` of the whole transaction. A revert would undo the failure counter and make `N` unenforceable. Callers and UIs may still present it as a failed migration: the adapter does not change.

`cancelScheduledStrategy` clears pending, the failure counter, and the cooldown. A new `scheduleStrategy` starts a new 14-day clock and a new `N` budget. That is the owner’s way to keep trying without impairing: refuse the `N`th failing execute, cancel, and reschedule.

### Harvest after impairment

#### Option E: Refill Grave from yield (strict §6.3 on all NAV gaps)

After impairment, `currentNAV < protectedPrincipal` keeps `harvestable = 0` until active capital climbs back to historical buried ETH. Reaper is unfunded for as long as that takes. This is spec §6.3 applied to abandoned capital as if it were a live strategy drawdown.

#### Option F: Split yield (part Reaper, part refill)

Some fraction of harvestable yield is retained until `currentNAV` returns to `protectedPrincipal`. Reaper is permanently weaker during recovery, and large impairments still take a very long time to refill.

#### Option G: Insurance reserve

Skim yield in advance into a loss fund. Weakens Reaper on every path for an event that may never happen. Changes yield allocation (spec §2 / §21) in the common case.

#### Option H: Acknowledge the loss; keep recovering the ETH (chosen)

Lost ETH is excluded from **active** Grave capital. Yield earned on remaining active capital continues to go 100% to Reaper. Impaired capital is tracked separately and remains eligible for permissionless recovery with no protocol time limit. Historical buried ETH is unchanged. New burials increase active capital and `protectedPrincipal`; they MUST NOT reduce `impairedCapital`. Only ETH actually returned from an impaired adapter reduces `impairedCapital`.

## Decision

Chosen option: **Option D + Option H**.

Option A abandons capital too easily and hides it. Option B bricks replacement. Option C makes abandonment a single owner click after the delay already passed. Option D uses the delay window for notice, then requires three 1-day-spaced on-chain failures before the protocol is allowed to leave ETH behind — long enough for transient liquidity, short enough that a bricked venue cannot block replacement for another week in a crisis. Permissionless recovery afterward means the `N`th failure is not a burn; it is a change of venue plus a public residual claim.

Option E is exactly the refill policy this record rejects: it would take years after a large impairment and would shut off Reaper during a crisis. Options F and G also starve Reaper, F slowly and G even when nothing is impaired. Option H keeps spec §2’s “100% of harvestable yield to Reaper” on the capital that is actually working, without pretending the Grave has been recapitalized.

### On-chain constants

| Constant | Value |
|---|---|
| `STRATEGY_MIGRATION_WITHDRAW_FAILURE_LIMIT` (`N`) | `3` |
| `STRATEGY_MIGRATION_RETRY_DELAY` | `1 days` |

Cranker retry count, backoff, and “more complex” recovery tactics are **not** protocol rules. The protocol exposes an unbounded permissionless recover path. Crankers MAY `eth_call` / simulate `recoverImpaired` before broadcasting so they do not spend gas on a revert or a 0-pay pull; the Grave keeper MUST do that, same as its existing simulate-before-send rule. Simulation does not repay debt and MUST NOT be treated as grounds to drop an adapter from the list.

### What counts as a failed pull

A migration execute **fails** the withdraw step when the old adapter is set and recoverable ETH is not fully obtained on Grave in that transaction. That includes:

- `withdrawETH` reverts;
- `totalAssetsInETH` reverts so the pull cannot be sized from the view (the execute MUST still attempt a pull; a reverting or zero-pay pull is a failure);
- a non-reverting pull that leaves reported or remaining adapter assets unreceived.

ETH that **does** arrive on Grave during a failed attempt stays on Grave (idle). It is not sent back to the old adapter and is not sent to `owner()`. Later successful execute, or the impairing `N`th execute, deposits that idle ETH into the new adapter.

Do not treat a fabricated high `totalAssetsInETH` as proof of assets for **lowering** the harvest watermark. Impairment accounting uses observed Grave/active NAV, not the old adapter’s claimed NAV (spec §16.3).

### Accounting

Keep `protectedPrincipal` as historical buried ETH. It only increases on successful `bury()` and never decreases.

Add `impairedCapital` (sum of unpaid impaired principal) and a per-adapter owed amount, both initially 0. Invariant: `impairedCapital == sum of owed[adapter]` over the impaired list. Define:

```text
historicalBuried = protectedPrincipal
activeGraveCapital = idleETH + activeStrategy.totalAssetsInETH()   // currentNAV; impaired adapters are not included
requiredBacking    = protectedPrincipal - impairedCapital
harvestable        = max(0, activeGraveCapital - requiredBacking - alreadyReservedForReaper)
```

`requiredBacking` is the harvest watermark. A harvest MUST NOT pull active backing below `requiredBacking`. It MAY complete while `currentNAV < protectedPrincipal` when `impairedCapital > 0`.

**Live adapter losses** (no migration, or a migration that fully withdraws): `impairedCapital` and per-adapter owed amounts unchanged. If `currentNAV < requiredBacking`, `harvestable = 0` until the live venue recovers. Spec §6.3 still applies to active capital.

**On the impairing execute** (the `N`th failed pull), after any ETH received this tx is on Grave and before/when switching adapters:

```text
observedActive   = address(this).balance   // plus any ETH already in the new adapter, which should be 0
delta            = max(0, requiredBacking - observedActive)
impairedCapital += delta
owed[old]       += delta
```

That sets `requiredBacking` down to observed active capital at that instant, so harvestable is 0 immediately after impairment and **future** gains on remaining capital are harvestable. It cannot mint harvestable yield out of a lying old NAV. If `old` is already on the list (impaired twice), add `delta` to the existing owed amount; do not reset it.

**On `bury()`:** `protectedPrincipal += msg.value`. `impairedCapital` and all owed amounts unchanged. Active capital rises by the buried ETH. Harvestable unchanged.

**On permissionless recovery** of `received` ETH from `adapter` (Grave balance delta, never the adapter’s return value alone):

```text
pay               = min(received, owed[adapter])
owed[adapter]    -= pay
impairedCapital  -= pay
```

Active NAV rises by `received`. `requiredBacking` rises by `pay`. Recovered ETH up to `owed[adapter]` is principal returning, not yield. Any `received` above `owed[adapter]` is unsolicited surplus (spec §16.2), not a reason to reduce another adapter’s debt. Donations and forced ETH to Grave are unchanged: they are not burials and they do not reduce `impairedCapital` or any owed amount.

If `totalAssetsInETH` reverted for the whole attempt window, still list the adapter, still record `owed[old] += delta`, and still apply the `observedActive` formula above (the missing ETH is whatever `requiredBacking` exceeded). Under-counting impaired capital is acceptable; over-counting from a fabricated NAV is not.

### Impaired adapter list and recovery

When `delta > 0` on an impairing execute, write the old adapter address into an on-chain list if it is not already present. The list is readable by crankers and anyone else. Membership means **this adapter still owes Grave**, not “this adapter currently holds ETH.”

An adapter MUST remain on the list while `owed[adapter] > 0`. It MUST NOT be removed because:

- `address(adapter).balance == 0`, WETH/aToken balances are 0, or any other external balance is 0;
- `totalAssetsInETH()` returns 0 or reverts;
- `recoverImpaired` reverts or pays 0;
- a cranker simulation suggests a pull would be useless;
- a later `bury()` or live-adapter profit increased active capital.

A partial repay reduces `owed[adapter]` and `impairedCapital` by `pay` and **leaves the adapter on the list**. Remove it if and only if `owed[adapter]` becomes 0 after an actual ETH receipt credited to that adapter. Debt is not forgotten: a bricked adapter that never pays stays on the list with its owed amount indefinitely.

Anyone MAY call a permissionless `recoverImpaired(adapter)` (final name is implementation) subject to:

- `adapter` is on the impaired list (`owed[adapter] > 0`);
- `nonReentrant`;
- `withdrawETH` recipient is Grave only;
- realized amount is the Grave balance delta;
- then existing idle-deploy into the **current** `activeStrategy` (try/catch as on `bury()`: idle is allowed if deposit reverts);
- no cooldown, no protocol-imposed retry limit, no owner-only gate.

A reverting recover call MAY revert; the cranker retries. The protocol MUST NOT try/catch recover in a way that credits `owed` / `impairedCapital` without ETH actually received, and MUST NOT drop the adapter on a 0-pay or reverting recover.

Crankers MAY simulate `recoverImpaired` (`eth_call` / `simulateContract`) before sending, so a revert or 0-pay pull does not waste gas. The Grave keeper MUST simulate (and MUST NOT send when the simulation reverts or Grave’s ETH balance would not increase). A failed or 0-pay simulation does not change on-chain owed amounts and does not remove the adapter.

There is still only one **active** investing adapter. Listed adapters are residual pull sources, not a second strategy.

### What this does not do

- It does not decrease `protectedPrincipal`.
- It does not refill historical Grave size from Reaper-bound yield.
- It does not pay owner, buriers, or an arbitrary EOA.
- It does not skip the 14-day delay when replacing a live adapter.
- It does not change era math, NETH issuance, or Reaper auction parameters.
- It does not drop an impaired adapter from the list while that adapter still owes ETH, including after a 0-pay recover or a zero venue balance.

## Consequences

- [`NIP-0006`](../nip/0006-strategy.md) §8.3 best-effort switch is replaced by this record. Tests such as `test_revertingOldWithdrawContinuesAndOwnerUnchanged` must expect: `N-1` committed failed executes (adapter unchanged, cooldown 1 day), then an `N`th execute that switches, lists the old adapter, and raises `impairedCapital`. Owner balance still unchanged.
- Spec §2 “Loss recovery first”, §6.2 `requiredBacking`, §6.3, §6.5 step 6 (recoverable assets), §7 harvest, and the §17 harvest/loss tests must be amended so:
  - loss-recovery-first applies to **active** capital vs `requiredBacking`;
  - `currentNAV < protectedPrincipal` is allowed after impairment without zeroing harvest forever;
  - post-harvest NAV must stay `>= requiredBacking`, not necessarily `>= protectedPrincipal`;
  - migration execute records failed pulls and only abandons after `N` failures with a 1-day cooldown;
  - impaired adapters and permissionless recovery exist.
- Spec §22’s instruction that an implementation agent must not change protected-principal / yield-allocation rules still holds for **unilateral** edits. This NDR is the accepted change those sections must follow.
- [`NIP-0007`](../nip/0007-aave-adapter.md) must stop saying migration continues best-effort on Aave `withdraw` revert. Harvest may still revert on insufficient Aave liquidity (unchanged).
- [`NIP-0009`](../nip/0009-grave-keeper.md): crankers SHOULD read the impaired list and MAY recover with whatever off-chain backoff they choose. Before a paid `recoverImpaired`, they MAY simulate; the shipped keeper MUST simulate and MUST NOT send a revert or 0-pay recover. Retry policy is not otherwise frozen here. Keeper still does not `executeStrategyMigration` (owner).
- Dashboard/views: expose `impairedCapital`, per-adapter `owed`, the impaired adapter list, and harvestable using `requiredBacking`. Do not display impaired ETH as active Grave capital. Do not hide an adapter that still owes because its venue balance is 0.
- Follow-up work: spec + NIP edits, then Grave storage/ABI (`impairedCapital`, per-adapter owed, list, failure/cooldown slots, recover function, events), tests (unit, fuzz, invariant, fork), keeper recover path with simulation. No contract changes in the change that only adds this NDR.
- Tests MUST keep an adapter on the list through 0-pay recovers, reverting recovers, and partial repays, and MUST remove it only when that adapter’s owed amount reaches 0 from credited ETH.
- What would trigger a superseding NDR: changing `N` or the 1-day cooldown; Solidity-reverting failed attempts so `N` cannot be counted; restoring Option E/F/G yield skimming; dropping the impaired list, making recover owner-only, or removing an adapter while `owed[adapter] > 0`; using old-adapter reported NAV or a zero venue balance to lower `requiredBacking` or to treat the debt as repaid; sending recovered ETH anywhere except Grave → active adapter (or idle on Grave if deposit fails).
