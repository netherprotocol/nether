# NIP-0012: Impaired strategy capital after failed migration withdraw

- Status: Implemented
- Date: 2026-08-17
- Workstream: W4 amendment (Grave accounting + migration execute); W8 keeper recover; W7 dashboard views
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md) §2, §6.2, §6.3, §6.5, §6.6, §7
- Decision: Accepted [`NDR-0009`](../ndr/0009-impaired-strategy-capital.md)
- Prior surface: Implemented [`0006-strategy.md`](0006-strategy.md)
- License: [`NDR-0004`](../ndr/0004-source-available-until-mainnet.md) (`SPDX-License-Identifier: UNLICENSED`)

This plan is how to implement [`NDR-0009`](../ndr/0009-impaired-strategy-capital.md) with the smallest change to contracts already shipped. It does not reopen burial finality, era math, Reaper economics, the 14-day replacement delay, one active adapter (spec §20), or admin `withdraw` of principal ([`NDR-0005`](../ndr/0005-strategy-security.md)).

The spec and this NIP are the follow-up NDR-0009 required before code. Production `Grave.executeStrategyMigration` records failed pulls, impairs leftover capital after `N` failures, and exposes `recoverImpaired`.

## 1. Purpose

Stop abandoning recoverable ETH on the first failed migration withdraw, keep a public residual claim after a bounded retry budget, and keep Reaper funded on remaining **active** capital.

Today `executeStrategyMigration` try/catches `withdrawETH`, always writes `activeStrategy = pending`, and drops unpaid ETH out of `currentNAV`. `harvest()` then treats that gap as a live loss and withholds all yield until NAV returns to `protectedPrincipal`.

NDR-0009 Option D + H: three 1-day-spaced recorded failures before the protocol may leave ETH behind; leftover capital is impaired, listed, and recoverable permissionlessly; harvest watermark is `requiredBacking = protectedPrincipal - impairedCapital`.

## 2. Scope

In scope (when implementation starts):

- `contracts/src/Grave.sol` only, among production monetary contracts
- Additive Grave storage, views, events, errors, and one new external function
- Harvest and migration execute internals on Grave
- Test mock controls needed to exercise revert / 0-pay / partial pull
- Unit, fuzz, invariant, and existing fork tests that encoded the old best-effort switch
- Grave keeper: read the impaired list, simulate `recoverImpaired`, send only when Grave ETH would increase
- Dashboard: show impaired capital, owed, list, and harvestable vs `requiredBacking`

Out of scope:

- Changing `IStrategyAdapter.sol` (would need an NDR; [`NIP-0000`](0000-the-roadmap.md) §6)
- `NETH.sol`, `Reaper.sol`, `EraMath.sol`
- `AaveV3WethAdapter.sol` bytecode (withdraw still reverts on insufficient Aave liquidity; Grave records that as a failed pull)
- New `StrategyManager`, `TimelockController`, pause, or admin `withdraw`
- Changing `executeStrategyMigration()` / `scheduleStrategy()` / `cancelScheduledStrategy()` / `harvest()` / `bury()` selectors
- Changing `pendingStrategy()` return type
- Option C force-flag, Option E/F/G yield skimming, Solidity-reverting failed attempts
- Accepting NDR-0002
- Deploy / Sepolia / mainnet (W6)

Do not implement ETH redemption, a second simultaneous investing adapter, or recover that pays anyone except Grave → active adapter (or idle on Grave if deposit fails).

## 3. Minimal contract surface

Production files that MUST NOT change:

| File | Why |
|---|---|
| `IStrategyAdapter.sol` | Spec §6.4 surface. Recovery is Grave calling the same `withdrawETH`. |
| `NETH.sol` / `EraMath.sol` | Issuance unchanged. |
| `Reaper.sol` | Harvest still sends ETH; auction math unchanged. |
| `AaveV3WethAdapter.sol` | Venue already caps withdraw by aToken balance and reverts when Aave `withdraw` reverts. Grave owns retry/impair. |

Grave constructor, `Ownable2Step`, `setReaper`, `STRATEGY_CHANGE_DELAY = 14 days`, and the bury mint path stay as shipped.

Existing external signatures that MUST keep the same selector:

```text
bury(uint256 minNethOut) payable
harvest()
scheduleStrategy(address newAdapter)
cancelScheduledStrategy()
executeStrategyMigration()          // still 0-arg; no force flag (NDR-0009 Option C rejected)
pendingStrategy() → (address, uint256)
currentNAV()
harvestableYield()
protectedPrincipal()
activeStrategy()
```

`harvestableYield()` changes **meaning** (watermark is `requiredBacking`) but not signature.

## 4. Architecture choices

These shapes are authorized for this slice. Spec and [`NDR-0009`](../ndr/0009-impaired-strategy-capital.md) win if anything below disagrees.

### 4.1 Same `executeStrategyMigration()`, not a sibling force function

NDR-0009 Option D keeps the pending schedule. Failed attempts are state-changing successes of the **existing** execute. A new `executeStrategyMigration(bool force)` was Option C and is rejected.

### 4.2 Recovery on Grave, not on the adapter

`recoverImpaired(address adapter)` lives on Grave. It is permissionless, `nonReentrant`, and calls `IStrategyAdapter(adapter).withdrawETH` with `recipient = address(this)`. No adapter interface change. No second active slot: listed adapters are residual pull sources only.

Name is locked here as `recoverImpaired` (NDR-0009 left the final name to implementation).

### 4.3 Manual impaired list, not a new OZ module

Grave already uses OZ `Ownable2Step` + `ReentrancyGuard`. Do not add `EnumerableSet` solely for this list. The list is small (one entry per impairing migration that still owes). Use:

```text
address[] internal impairedAdapters;          // order not significant
mapping(address => uint256) public impairedOwed;
mapping(address => uint256) internal impairedIndex; // 1-based into impairedAdapters; 0 = not listed
uint256 public impairedCapital;
```

Invariant: `impairedCapital == sum of impairedOwed[adapter]` over `impairedAdapters`. An address is listed iff `impairedOwed[adapter] > 0` iff `impairedIndex[adapter] != 0`.

Swap-and-pop remove **only** when a credited recover drives `impairedOwed[adapter]` to 0.

### 4.4 Pending failure slots next to the existing pending pair

```text
uint256 internal pendingWithdrawFailures;    // 0 when none pending
uint256 internal lastMigrationFailureTime;   // 0 when no failure on this pending
```

Do not widen `pendingStrategy()`. Add:

```text
pendingWithdrawFailures() → uint256
lastMigrationFailureTime() → uint256
```

`cancelScheduledStrategy` already clears `pendingAdapter` / `pendingExecuteAfter`. Also zero these two. `scheduleStrategy` starts them at 0.

### 4.5 Harvest error identifier kept

Reuse `HarvestBreachesPrincipal` when post-realization `currentNAV < requiredBacking`. Do not add a second harvest-breach error. The identifier is historical; the watermark is `requiredBacking`.

### 4.6 Pull sizing when `totalAssetsInETH` reverts

NDR-0009 requires the execute to still attempt a pull. Existing adapters cap internally (`TestInvestAdapter` by balance/realizable; `AaveV3WethAdapter` by aToken balance, including `type(uint256).max` for a full exit).

```text
if totalAssetsInETH succeeds:
    request = reported assets          // 0 ⇒ no withdraw, pull succeeded
else:
    request = type(uint256).max        // still attempt; reverting or 0-pay is a failure
```

Do not size the pull from `address(old).balance` (misses aTokens). Do not skip the pull because the view reverted.

## 5. Grave ABI additions

File: `contracts/src/Grave.sol`. `pragma solidity 0.8.36`. SPDX `UNLICENSED`.

### 5.1 Constants

```text
STRATEGY_CHANGE_DELAY                         = 14 days          // unchanged
STRATEGY_MIGRATION_WITHDRAW_FAILURE_LIMIT     = 3                // N
STRATEGY_MIGRATION_RETRY_DELAY                = 1 days
```

Public constants, not constructor arguments.

### 5.2 New views

| View | Behavior |
|---|---|
| `impairedCapital()` | unpaid impaired principal; public state |
| `requiredBacking()` | `protectedPrincipal - impairedCapital` (compute; do not store) |
| `impairedOwed(address)` | per-adapter owed; public mapping getter |
| `impairedAdapterCount()` | `impairedAdapters.length` |
| `impairedAdapterAt(uint256 i)` | revert if `i >= count` |
| `pendingWithdrawFailures()` | failures committed on the current pending; 0 if none pending |
| `lastMigrationFailureTime()` | timestamp of last committed failed execute; 0 if none |

`currentNAV()` unchanged: idle + **active** adapter only. If the active adapter reverts on `totalAssetsInETH()`, `currentNAV` / `harvestableYield` / `requiredBacking` callers that read NAV still revert. Impaired adapters are not consulted.

`harvestableYield()`:

```text
nav = currentNAV()
req = requiredBacking()
return nav > req ? nav - req : 0
```

### 5.3 New function

```solidity
function recoverImpaired(address adapter) external nonReentrant returns (uint256 received);
```

Anyone. See §8.

### 5.4 Errors (add; do not rename existing)

```text
StrategyMigrationRetryDelayNotElapsed(uint256 retryAfter)
AdapterNotImpaired()
ZeroRecover()
```

`NoPendingStrategy`, `StrategyDelayNotElapsed`, `HarvestBreachesPrincipal`, and the rest stay.

### 5.5 Events (add)

```text
event StrategyMigrationWithdrawFailed(
    address indexed oldStrategy,
    address indexed newStrategy,
    uint256 attempt,
    bytes reason
);
event StrategyImpaired(
    address indexed oldStrategy,
    address indexed newStrategy,
    uint256 impairedDelta,
    uint256 impairedCapital
);
event ImpairedRecovered(
    address indexed adapter,
    uint256 received,
    uint256 pay,
    uint256 impairedCapital
);
```

`attempt` is 1-based (`pendingWithdrawFailures` after the increment). `reason` is adapter revert data, or empty when the pull did not revert but was incomplete.

Keep `StrategyMigrated` only for an actual adapter switch (full success or impairing `N`th execute). Do not emit it on a failed attempt that leaves `activeStrategy` unchanged.

`StrategyMigrationCancelled` unchanged besides also clearing failure slots.

## 6. `executeStrategyMigration` (replace NIP-0006 §8.3)

`onlyOwner`, `nonReentrant`, same selector.

```text
require pending set
old = activeStrategy; new = pending adapter
if old != 0: require block.timestamp >= executeAfter          // NDR-0008: skip when old == 0
if old != 0 and pendingWithdrawFailures > 0:
    require block.timestamp >= lastMigrationFailureTime + 1 days

navBefore = _navSnapshot()   // idle + active; try/catch old view as today

if old == 0:
    // first activation: no pull, no failure budget
    _completeMigration(old, new, navBefore, idle = address(this).balance, revertOnDepositFail = true)
    return

(fullSuccess, received, reason) = _tryPullRecoverable(old)

if fullSuccess:
    _completeMigration(...)   // clear pending + failure slots; deposit idle (revert on fail, as today)
    return

// failed pull; ETH that arrived stays idle on Grave
failures = pendingWithdrawFailures + 1
pendingWithdrawFailures = failures
lastMigrationFailureTime = block.timestamp
emit StrategyMigrationWithdrawFailed(old, new, failures, reason)

if failures < N:
    return    // adapter unchanged; pending remains; tx succeeds

// Nth failure: impair, then switch
observedActive = address(this).balance + _assetsIfAny(new)   // try/catch view; 0 on revert
delta = requiredBacking > observedActive ? requiredBacking - observedActive : 0
if delta > 0:
    impairedCapital += delta
    _creditOwed(old, delta)    // add to list if new
emit StrategyImpaired(old, new, delta, impairedCapital)
_completeMigration(..., revertOnDepositFail = false)   // _deployIdle try/catch; must not undo impairment
```

`_completeMigration`:

1. `activeStrategy = new`
2. clear pending adapter, `executeAfter`, `pendingWithdrawFailures`, `lastMigrationFailureTime`
3. if idle > 0: either `new.depositETH{value: idle}()` (revert rolls back — **full-success path only**) or `_deployIdle()` try/catch (`StrategyDepositFailed` — **impairing path**)
4. `navAfter = currentNAV()` (active is now `new`)
5. emit `StrategyMigrated(old, new, navBefore, navAfter)` and `StrategyDeposit` if a deposit succeeded

Why try/catch only on the impairing deposit: a reverting new adapter must not undo the `N`th failure counter or the escape from the old venue (spec §16.1). Full-success execute may still revert on new-adapter deposit (retry execute; no impairment written). That is the smallest change from today’s execute.

### 6.1 `_tryPullRecoverable(old) → (fullSuccess, received, reason)`

Verify received by Grave balance delta, never the return value alone (spec §16.3). Recipient is always Grave. Never `owner()`.

```text
balBefore = address(this).balance
reportedOk = false
request = type(uint256).max
reason = ""

try old.totalAssetsInETH() returns (uint256 assets):
    reportedOk = true
    request = assets
catch (bytes memory data):
    reason = data
    request = type(uint256).max

if reportedOk and request == 0:
    return (true, 0, "")

try old.withdrawETH(request, address(this)) returns (uint256):
    received = address(this).balance - balBefore
catch (bytes memory data):
    received = address(this).balance - balBefore   // keep any ETH that arrived
    reason = data
    return (false, received, reason)

if not reportedOk:
    return (false, received, reason)   // cannot prove completeness

remaining = 0
try old.totalAssetsInETH() returns (uint256 left):
    remaining = left
catch (bytes memory data):
    return (false, received, data)

if remaining > 0 or received < request:
    return (false, received, "")

return (true, received, "")
```

A 0-pay non-revert while `request > 0` is a failure (`received < request`). A revert is a failure. ETH received on a failed attempt is not sent back.

Do not call `depositETH` on old or new during a failed attempt with `failures < N`.

### 6.2 `_assetsIfAny(adapter)`

`try adapter.totalAssetsInETH() returns (assets) { return assets } catch { return 0 }`. Used only for `observedActive` on the new adapter (should be 0). Under-count is acceptable; do not add old-adapter reported NAV into `observedActive`.

### 6.3 `_creditOwed(adapter, delta)`

If `delta == 0`, do not list. If already listed, `impairedOwed[adapter] += delta`. If not listed, push onto `impairedAdapters`, set 1-based index, set owed to `delta`.

### 6.4 First activation and cancel

First adapter (`old == 0`): immediate execute per [`NDR-0008`](../ndr/0008-initial-strategy-immediate.md). No pull, no failure budget, no impaired list write.

`cancelScheduledStrategy`: revert if none pending; emit cancel; clear pending adapter, executeAfter, `pendingWithdrawFailures`, `lastMigrationFailureTime`. Does not change `activeStrategy`, `impairedCapital`, or the impaired list.

`scheduleStrategy`: still one pending slot; still `SameStrategy` / `InvalidStrategy` / `StrategyAlreadyPending`. Failure budget starts at 0. New 14-day clock.

## 7. Harvest watermark

Replace `protectedPrincipal` with `requiredBacking()` in the harvest math already shipped by [`NIP-0006`](0006-strategy.md) §7. Do not change the two-source realization (idle surplus + adapter balance delta). Do not change immediate send to Reaper. `alreadyReservedForReaper` stays 0 in the formula.

```text
reportedHarvestable = harvestableYield()          // vs requiredBacking
idleSurplus         = max(0, idle - requiredBacking())
toPull              = reportedHarvestable > idleSurplus ? reportedHarvestable - idleSurplus : 0
ethHarvested        = idleSurplus + received from active adapter
cap                 = max(0, currentNAV() - requiredBacking())
if currentNAV() < requiredBacking(): revert HarvestBreachesPrincipal
```

Live-adapter losses: `impairedCapital` unchanged; if `currentNAV < requiredBacking`, harvestable is 0 (spec §6.3).

`bury()`: `protectedPrincipal += msg.value` as today. Do **not** touch `impairedCapital` or owed. Then `_deployIdle()` into the **active** adapter only.

Donations / `receive()`: still no mint, no principal change, no owed change.

## 8. `recoverImpaired`

```text
require nonReentrant
require impairedOwed[adapter] > 0 else AdapterNotImpaired
balBefore = address(this).balance
adapter.withdrawETH(type(uint256).max, address(this))   // no try/catch: revert reverts the tx
received = address(this).balance - balBefore
if received == 0: revert ZeroRecover

pay = min(received, impairedOwed[adapter])
impairedOwed[adapter] -= pay
impairedCapital -= pay
if impairedOwed[adapter] == 0:
    _removeImpaired(adapter)    // swap-and-pop; delete index
emit ImpairedRecovered(adapter, received, pay, impairedCapital)
_deployIdle()                   // try/catch into current activeStrategy; idle allowed
return received
```

Sizing with `type(uint256).max` matches Aave’s full-exit path and the test mock cap. Recipient is Grave. Realized amount is the balance delta.

Do not credit owed on revert. Do not remove the adapter on revert. `ZeroRecover` makes a 0-pay simulation a revert so the keeper’s “do not send if Grave ETH would not increase” gate is unambiguous. A 0-pay that somehow succeeded without revert would still be forbidden from reducing owed; reverting is the smaller surface.

`received > owed[adapter]`: credit only `pay = owed`; surplus stays as idle/NAV surplus (spec §16.2). Do not reduce another adapter’s debt.

No cooldown, no protocol retry limit, not `onlyOwner`.

## 9. Test invest adapter

File: `contracts/test/mocks/TestInvestAdapter.sol` (still not under `src/`).

Keep existing `setReportedNav` / `setRealizable` / `simulateProfit` / `simulateLoss`. Add test-only flags:

```text
setWithdrawRevert(bool)     // withdrawETH reverts (after onlyGrave)
setNavRevert(bool)          // totalAssetsInETH reverts
```

0-pay without revert remains `setRealizable(0)` with a positive balance. Do not copy these flags into `src/strategy/`.

Existing `RevertingWithdrawAdapter` / `ToggleNavAdapter` in unit tests may stay; they already cover revert cases.

## 10. What this must not do

Spec §2, §6, §10, §16, §20 and NDR-0009 “What this does not do”:

- no decrease of `protectedPrincipal`
- no refill of historical Grave size from Reaper-bound yield
- no principal or recovered ETH to owner, burier, or an arbitrary EOA
- no skip of the 14-day delay when replacing a live adapter
- no change to era math, NETH issuance, or Reaper auction parameters
- no drop of an impaired adapter while it still owes, including after 0-pay recover or a zero venue balance
- no `IStrategyAdapter` change
- no second active investing adapter
- no pause on Grave or Reaper
- no Solidity revert of the whole execute on a failed pull when `failures < N`
- no using old-adapter reported NAV to lower `requiredBacking`

## 11. Tests

Spec §17. Behavior ships with this slice. Existing burial/Reaper suites stay green.

Rewrite `test_revertingOldWithdrawContinuesAndOwnerUnchanged` (and any fork/unit twin that expected a one-shot best-effort switch):

1. After 14 days, first execute: `activeStrategy` still old; `pendingWithdrawFailures == 1`; cooldown set; owner ETH unchanged; unpaid ETH still in old adapter.
2. Immediate second execute reverts `StrategyMigrationRetryDelayNotElapsed`.
3. Warp 1 day, second execute: still old adapter; failures == 2.
4. Warp 1 day, third execute: switch to pending; old listed if `delta > 0`; `impairedCapital` raised by `delta`; owner ETH unchanged; idle/deployed ETH is only what actually reached Grave.

### 11.1 Unit

In addition to today’s harvest/migration cases, with `requiredBacking` in place of `protectedPrincipal` for the harvest watermark:

- full pull still migrates in one execute; `impairedCapital == 0`; list empty
- `N-1` failures then success on a later execute (no impair) if a subsequent pull is complete
- cancel after failures: pending and failure slots clear; list unchanged; a new schedule has a fresh 14-day clock and `N = 3`
- same-block / same-day three executes cannot impair (cooldown)
- `totalAssetsInETH` revert: execute still attempts withdraw; counts as failure
- 0-pay non-revert with remaining assets: failure
- partial pay, remainder left: failure; paid ETH stays idle on Grave; next success or `N`th execute deposits it into the new adapter
- impairing execute uses `observedActive`, not old reported NAV; a lying high old NAV does not increase `delta`
- `delta == 0`: switch anyway; do not list
- second impairment of the same adapter: add `delta` to existing owed; still one list entry
- `bury()` after impair: principal up; `impairedCapital` unchanged; harvestable unchanged by the bury itself
- live-adapter `simulateLoss` after impair: harvestable 0 until active NAV ≥ `requiredBacking` (not until ≥ `protectedPrincipal`)
- post-impair profit on the **new** adapter: harvestable is the excess above `requiredBacking`; 100% to Reaper
- `recoverImpaired` unknown / zero-owed adapter reverts `AdapterNotImpaired`
- recover revert (adapter withdraw reverts): owed unchanged; still listed
- recover 0-pay: `ZeroRecover`; owed unchanged; still listed
- partial recover: owed and `impairedCapital` down by `pay`; still listed
- full recover: owed 0; removed from list; `impairedCapital` down by that pay
- recover surplus above owed: `pay = owed`; adapter removed; extra ETH is surplus, not a credit against another adapter
- recover then `_deployIdle` into **current** active; if deposit reverts, ETH idle; `StrategyDepositFailed`
- recover `nonReentrant`; recipient is Grave; owner balance unchanged
- `harvest` after recover of principal: recovered `pay` is not harvestable; only NAV above the new `requiredBacking` is
- no path sends recovered ETH to `owner()`

### 11.2 Fuzz / invariant

Extend [`NIP-0006`](0006-strategy.md) §13.2–§13.3 with spec §17 properties:

```text
protectedPrincipal never decreases
impairedCapital == sum of impairedOwed over the list
list membership <=> impairedOwed > 0
bury / donate / forced ETH never reduce impairedCapital or owed
harvest never sends idle ETH required as requiredBacking
post-successful-harvest currentNAV >= requiredBacking
recover credits only min(received, owed) for that adapter
owner / migration / recover never pay owner()
only one activeStrategy
executed adapter == scheduled adapter on a switch
```

Invariant handler: existing bury/harvest/donate/schedule/cancel/execute/adapter P/L, plus `recoverImpaired` on listed addresses, plus warps of 1 day and 14 days, plus mock withdraw/nav reverts. Do **not** globally assert `currentNAV >= protectedPrincipal`.

Keep `test/invariant/Grave.t.sol` as the no-strategy suite.

### 11.3 Fork

[`NIP-0008`](0008-e2e-fork-suite.md) happy-path Aave → Aave migration stays one successful execute (full withdraw). Do not brick live Aave utilization in that family lifecycle.

[`NIP-0007`](0007-aave-adapter.md) adapter tests: a Grave execute whose Aave `withdraw` reverts is a **recorded failure**, not a switch. Harvest still reverts on insufficient Aave liquidity (no try/catch on harvest). No adapter bytecode change.

## 12. Aave adapter docs only

No `AaveV3WethAdapter` code change. Update the W5 plan’s “migration continues best-effort” sentences so they point here: Grave records failed pulls; harvest revert on Aave liquidity is unchanged.

Risk note (already true): high utilization reverts `withdrawETH`; that is now a migration failure toward `N`, not an immediate venue abandon.

## 13. Grave keeper

File tree: `apps/keeper/` as shipped by [`NIP-0009`](0009-grave-keeper.md).

Add `recoverImpaired` to the crank loop. Keeper still does **not** `executeStrategyMigration` (owner).

Tick order:

```text
finalize → recoverImpaired (each listed adapter) → harvest → start
```

Recover first so returned principal is on Grave (and deployed) before harvest. Recovered `pay` raises `requiredBacking` and is not yield.

For each `i in [0, impairedAdapterCount)`:

1. `adapter = impairedAdapterAt(i)`
2. view-check `impairedOwed(adapter) > 0`
3. `simulateContract({ functionName: 'recoverImpaired', args: [adapter] })`
4. MUST NOT send if simulation reverts
5. MUST NOT send if simulated Grave ETH balance would not increase (including `ZeroRecover`)
6. MAY skip dust against an optional `--min-recover-wei` (default `0`: any positive receipt is sent). Recover is principal returning; do not apply the harvest fee-floor unless the operator sets a min.
7. A failed or 0-pay simulation does not change owed and MUST NOT be treated as grounds to drop the adapter or to stop iterating the rest of the list

Snapshot reads: add `impairedCapital`, `requiredBacking` (or compute), count + at(i), owed. Harvest gate: `harvestableYield() > 0` and `currentNAV >= requiredBacking` (not `protectedPrincipal`). Keep an alert when `currentNAV < protectedPrincipal` **and** `impairedCapital == 0` (live loss). When `impairedCapital > 0`, alert the residual claim; do not skip harvest solely because NAV is below historical buried ETH.

`--dry-run` still never sends. Gas ledger action name: `recoverImpaired`.

## 14. Dashboard

[`NIP-0010`](0010-grave-dashboard.md) GRAVE left column, additive rows (Lucide already in tree; no new icon pack, no invented marks):

| Row | Source / rule |
|---|---|
| Required backing | `requiredBacking()` |
| Impaired capital | `impairedCapital()`; **not** part of Strategy NAV |
| Impaired adapters | `impairedAdapterCount` / `impairedAdapterAt` / `impairedOwed`; show address + owed; do not hide owed adapters when venue balance is 0 |

`Strategy NAV` remains `currentNAV()` (active only). `Harvestable yield` remains `harvestableYield()` (already vs `requiredBacking` after Grave lands). Pending row may show `pendingWithdrawFailures` and retry-after when failures > 0.

Do not display impaired ETH as active Grave capital. Holder hero stats that show `protectedPrincipal` as total buried stay correct.

## 15. Tree

```text
contracts/src/Grave.sol                         extended (only production monetary file)
contracts/src/interfaces/IStrategyAdapter.sol   unchanged
contracts/src/strategy/AaveV3WethAdapter.sol    unchanged
contracts/test/mocks/TestInvestAdapter.sol      withdraw/nav revert flags
contracts/test/unit/Strategy.t.sol              rewrite best-effort test; recover / impair cases
contracts/test/fuzz/Strategy.t.sol              requiredBacking + impair properties
contracts/test/invariant/Strategy.t.sol         recoverImpaired selector; list invariant
apps/keeper/src/*                               recover path + harvest gate
apps/web/src/lib/abi.ts, protocol.ts, dashboard rows
```

Do not add `src/interfaces/IGrave.sol`.

## 16. Implementation steps

Do not run these until this NIP is explicitly started. Spec + related NIP edits in this document set are already the NDR-0009 doc follow-up.

1. Extend `Grave.sol` as in §5–§8. Reuse `_deployIdle` / `_collectFromAdapter` where they still fit. Do not import `Reaper.sol`. Do not add `Pausable`.
2. Do not change `IStrategyAdapter`, NETH, EraMath, Reaper, or `AaveV3WethAdapter`.
3. Extend `TestInvestAdapter` flags in §9.
4. Rewrite unit/fuzz/invariant/fork tests in §11.
5. Keeper recover path (§13). Dashboard rows (§14).
6. From `contracts/`: `forge fmt`, `forge build`, `forge test`. Keeper and web typecheck/tests as in their CI.

## 17. Acceptance criteria

This NIP is done when:

- `IStrategyAdapter` is unchanged; no adapter-surface NDR was opened
- `executeStrategyMigration()` is still 0-arg; failed pulls with `failures < N` succeed as txs, do not switch, and enforce a 1-day cooldown
- the `N`th failed pull switches, accounts `delta` from `observedActive` (not old reported NAV), lists the old adapter iff `delta > 0`, and does not pay `owner()`
- `protectedPrincipal` never decreases; `bury` / donations do not reduce `impairedCapital`
- `harvestableYield` uses `requiredBacking`; post-harvest `currentNAV >= requiredBacking`; harvest MAY succeed while `currentNAV < protectedPrincipal` if `impairedCapital > 0`
- live-adapter losses still zero harvest until active NAV ≥ `requiredBacking`
- `recoverImpaired` is permissionless, credits only actual Grave ETH, removes an adapter iff that adapter’s owed hits 0, and deploys idle into the current active adapter (or leaves idle)
- Aave adapter bytecode unchanged; harvest still reverts on Aave withdraw failure
- keeper simulates recover and does not send revert/0-pay; it does not `executeStrategyMigration`
- dashboard exposes impaired capital, owed, list, and required backing; impaired ETH is not shown as Strategy NAV
- `forge fmt --check`, `forge build`, and `forge test` pass from `contracts/`
- NDR-0002 is still Proposed unless accepted separately

## 18. Not decided here

Leave these to later NIPs / NDRs:

- production adapter internals ([`NIP-0007`](0007-aave-adapter.md) / [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md))
- any `IStrategyAdapter` surface change
- cranker backoff beyond “simulate then send if Grave ETH increases” ([`NDR-0009`](../ndr/0009-impaired-strategy-capital.md): not a protocol rule)
- W6 ownership transfer, CREATE2, cost script
- accepting NDR-0002
- later safer meta-adapter and `owner → address(0)` ([`NDR-0005`](../ndr/0005-strategy-security.md))

Changing `N`, the 1-day cooldown, Solidity-reverting failed attempts, restoring yield skimming, making recover owner-only, or dropping a still-owing adapter requires a superseding NDR, not an edit to this plan’s economics.
