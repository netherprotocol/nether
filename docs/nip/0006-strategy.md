# NIP-0006: Strategy interface, harvest, and strategy governance

- Status: Implemented
- Date: 2026-08-14
- Workstream: W4
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Working versions: Proposed [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md) (not accepted)
- Strategy admin: Accepted [`NDR-0005`](../ndr/0005-strategy-security.md)
- License: [`NDR-0004`](../ndr/0004-source-available-until-mainnet.md) (`SPDX-License-Identifier: UNLICENSED`)

This plan is the W4 breakdown. It implements spec §6.2–§6.5, §7, §10–§11, and the harvest / strategy views and events in §12–§13. It does not implement a production adapter, deploy scripts, a DEX, or pause on Grave/Reaper ([`NDR-0005`](../ndr/0005-strategy-security.md)).

## 1. Purpose

Ship the replaceable economic surface: Grave talks to `IStrategyAdapter`, harvests yield above protected principal into Reaper, and lets admin replace the adapter after a 14-day public delay. Grave admin is strategy replacement only. Investing pause, if any, lives on the adapter. Reaper is not paused.

M0 must not depend on AAVE. The approved extra split is a **test invest adapter** under `contracts/test/` ([`NIP-0000`](0000-the-roadmap.md) §2). Production adapter code is W5, after its NDR.

NETH, era math, and Reaper auction economics stay as shipped. W4 extends `Grave.sol` in place. Reaper is unchanged except that W4 harvest already credits `msg.sender == grave`.

## 2. Scope

In scope:

- Use `IStrategyAdapter` **exactly** as spec §6.4 / `contracts/src/interfaces/IStrategyAdapter.sol` (no surface NDR)
- Test invest adapter under `contracts/test/mocks/` (idle ETH plus scripted profit/loss; never deploy on mainnet, §18.2)
- `currentNAV = idleETH + strategy.totalAssetsInETH()`; high-watermark harvest; loss-recovery-first
- Permissionless `harvest()` that sends realized surplus ETH to Reaper (`YieldHarvested`)
- One-time Grave → Reaper wiring (spec §18.3 deploys Reaper after Grave)
- After a successful `bury()`, move idle ETH into the active adapter when one is set; if `depositETH` reverts, leave ETH idle (do not revert `bury()`)
- Strategy scheduling, 14-day delay, migration through Grave into the new adapter, post-migration NAV event
- `Ownable2Step` on Grave for admin handoff; production ownership leaves the deployer EOA at W6; do not disable `renounceOwnership` (later lock per [`NDR-0005`](../ndr/0005-strategy-security.md))
- Unit, fuzz, invariant, and §15.3 yield-scenario tests required by spec §17 for harvest and migration

Out of scope:

- Production adapter under `contracts/src/strategy/` (W5; NDR before code)
- Deploy scripts, CREATE2, cost abort, explorer verification (W6)
- Frontend (W7), keeper (W8)
- Accepting NDR-0002
- Changing NETH or `EraMath` ([`NIP-0003`](0003-neth.md), [`NIP-0004`](0004-grave.md) already shipped)
- Uniting W4 and W5 into one delivery ([`NIP-0000`](0000-the-roadmap.md) §2)
- A separately deployed `StrategyManager` or OpenZeppelin `TimelockController` (see §3)
- Keeper incentive from principal (production default is zero, spec §7)
- Proxies, upgradeability of NETH / Grave / Reaper

Do not implement ETH redemption, multiple simultaneous adapters, leverage, a NETH oracle, or DEX logic.

## 3. Architecture choices

These are the authorized shapes for W4. They do not change era math, harvestable-yield allocation, or the 14-day delay. Spec wins if anything below disagrees. Pause placement is [`NDR-0005`](../ndr/0005-strategy-security.md).

### 3.1 Strategy slot on Grave, not a separate `StrategyManager`

Spec §11 lists `StrategyManager` / strategy slot as the migration component and gives Grave “burial, eras, protected principal, strategy accounting”. Spec §18.2 says minimize separately deployed helper contracts. [`NIP-0004`](0004-grave.md) already said W4 extends `Grave.sol` in place. [`NIP-0001`](0001-scaffolding.md) §4 left “separate contract vs module of Grave” as a W4 question.

| Shape | Why not |
|---|---|
| Separate deployed `StrategyManager` | Extra contract, extra permissions between manager and Grave, extra launch gas against the §18 budget. Spec §11 already puts strategy accounting on Grave. |
| Merge adapter into Grave | Forbids replacement. Spec §6.4 / §21: the adapter is the replaceable piece. |
| Strategy slot on Grave (chosen) | One monetary contract, mutable adapter address only, no extra deploy. Matches §18.2 and NIP-0004. |

Do not add `src/StrategyManager.sol`.

### 3.2 Admin: `Ownable2Step` on Grave only

Spec §10.2: admin schedules/executes strategy changes. [`NIP-0001`](0001-scaffolding.md) §5 names `Ownable2Step` for W4 handoff. [`NDR-0005`](../ndr/0005-strategy-security.md): Grave admin is replacement only; no pause on Grave.

| Shape | Why not |
|---|---|
| `AccessControl` with several roles | Spec does not split roles. Extra surface for W6 permission checks. |
| `Ownable` without two-step | Spec §10.2 requires an explicit tested handoff; two-step prevents a mistyped Safe address from instantly taking control. |
| Owner on Reaper or NETH | Reaper has no admin functions. NETH mint lock is already one-shot `setGrave` ([`NIP-0003`](0003-neth.md)). |
| Disable `renounceOwnership` | Would block the later `owner → address(0)` lock in NDR-0005. |
| `Ownable2Step` on Grave (chosen) | Single admin, two-step transfer, W6 sets owner to existing Base Safe infrastructure. Renounce stays available; W6 must not call it at launch. |

W4 tests use an EOA `admin`. W6 transfers to a multisig-capable account. Do not deploy a Safe or custom multisig in this slice (§18.2). Do not renounce at launch.

### 3.3 14-day delay on Grave, not `TimelockController`

Spec §6.5 / §21: strategy change delay is 14 days and immutable. Spec §11: lowest-cost audited timelock implementation. [`NIP-0001`](0001-scaffolding.md) §5: `TimelockController` only if W4/W6 cannot reuse already-deployed Base infrastructure.

Safe (or equivalent) does not itself enforce a 14-day adapter delay. The delay must be in protocol code. Embedding `schedule` / `cancel` / `execute` on Grave with a constant `STRATEGY_CHANGE_DELAY = 14 days` is the lowest-cost shape: no extra contract, events already in spec §13, W6 can still use a Safe as `owner()`.

Do not take the delay as a constructor argument. Do not also deploy `TimelockController` in W6 in front of the same 14-day rule (that would stack delays). W6 ownership transfer is the multisig; Grave’s delay is the spec timelock.

### 3.4 One-time `setReaper` on Grave

Spec §18.3 deploys Grave before Reaper, then harvest must send ETH to Reaper. Same wiring problem as NETH mint authority ([`NIP-0003`](0003-neth.md)). [`NIP-0005`](0005-reaper.md) already classifies `msg.sender == grave` as harvested yield, so Reaper needs no setter.

```text
reaper starts at address(0)
setReaper(address reaper_) onlyOwner, once
  reject address(0) and EOAs (extcodesize == 0)
  store reaper; never write it again
```

`harvest()` reverts until `setReaper` succeeds. `bury()` works before Reaper is set (idle ETH, same as W2). There is no standing `setReaper` after the lock. Emit `ReaperSet(address indexed reaper)` (not in spec §13’s minimum list; same role as NETH `GraveSet` for W6 post-deploy checks).

### 3.5 No pause on Grave or Reaper

Spec §6.5 pause is MAY. [`NDR-0005`](../ndr/0005-strategy-security.md): do not pause Reaper (if it has ETH, it should spend it; pause does not restore yield). Do not put pause on Grave. Investing stop, if any, is adapter-specific and not part of `IStrategyAdapter`.

Do not add `Pausable` to Grave or Reaper. Do not check `grave.paused()` in `startAuction`. Spec §13 `EmergencyPause` / `EmergencyUnpause` are not Grave events in this slice.

If `depositETH` reverts, `bury()` still succeeds and leaves ETH idle (no pause escape hatch).

### 3.6 Immediate harvest transfer; `alreadyReservedForReaper` is not stored

Spec §6.2:

```text
harvestable = max(0, currentNAV - requiredBacking - alreadyReservedForReaper)
```

`alreadyReservedForReaper` is yield already removed from Grave backing and sent to Reaper. If harvest always transfers in the same transaction, that ETH leaves `currentNAV` immediately. A standing reserved counter on Grave would double-subtract.

W4 keeps `alreadyReservedForReaper = 0` in the formula. Reaper’s `totalHarvestedETH` / `availableReaperETH` are the harvested-yield records ([`NIP-0005`](0005-reaper.md)). Do not add a Reaper funding escrow contract.

## 4. `IStrategyAdapter`

Do not change `contracts/src/interfaces/IStrategyAdapter.sol`. Spec §6.4 is the surface. A difference would need an NDR ([`NIP-0000`](0000-the-roadmap.md) §6).

```solidity
interface IStrategyAdapter {
    function depositETH() external payable;
    function withdrawETH(uint256 amount, address recipient) external returns (uint256 received);
    function totalAssetsInETH() external view returns (uint256);
    function underlying() external view returns (address);
}
```

The interface does not name `onlyGrave`. Adapters MUST still reject callers other than Grave on `depositETH` / `withdrawETH`. Grave MUST:

- call only `activeStrategy`;
- pass `recipient = address(this)` (Grave) on every `withdrawETH`;
- verify actual ETH received by balance delta, not only the returned `received` (spec §16.3);
- never pass the admin, a user, or Reaper as `recipient`.

Grave then forwards harvested ETH to Reaper itself. An adapter MUST NOT mint NETH, call `sellToReaper`, alter era state, use leverage, or hold directional non-ETH exposure as its intended return (spec §6.4).

`underlying()` for the native-ETH test adapter is `address(0)`. Production `underlying()` is canonical WETH ([`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md)).

Only one active adapter (spec §20). `activeStrategy() == address(0)` means idle ETH on Grave, as in W2.

## 5. Test invest adapter

Approved extra split ([`NIP-0000`](0000-the-roadmap.md) §2). File: `contracts/test/mocks/TestInvestAdapter.sol`. Not under `contracts/src/`. Not a W6 deploy artifact.

One mock covers idle ETH and scripted profit/loss so unit, fuzz, and invariant tests do not need AAVE.

```text
pragma solidity 0.8.36;

constructor(address grave_)              // reject address(0); store immutable grave

depositETH() payable                    // only grave; ETH stays on the adapter
withdrawETH(amount, recipient)          // only grave; cap by realizable ETH; send to recipient
totalAssetsInETH()                      // see below
underlying()                            // address(0)

// test-only controls (not on IStrategyAdapter; never copy into src/strategy/)
setReportedNav(uint256 nav)             // optional override; type(uint256).max means “use real”
setRealizable(uint256 amount)           // cap withdrawETH to this (default: balance)
simulateProfit() payable                // extra ETH credited as real assets
simulateLoss(uint256 amount)            // send ETH away so balance/NAV drop
```

Default: `totalAssetsInETH() == address(this).balance` (honest idle ETH). `setReportedNav` is for spec §16.1 NAV misreporting tests. `withdrawETH` MUST still be capped by actual ETH (`min(amount, realizable, balance)`), so a high-lying NAV cannot mint ETH.

Loss: `simulateLoss` reduces real ETH (send to a sink). Recovery: `simulateProfit` or `deal` extra ETH onto the adapter. Unrealized-then-realize: report NAV above balance, then `simulateProfit` until balance catches up; `harvest` may only take what `withdrawETH` actually pays.

Do not add `onlyOwner` on the mock beyond `onlyGrave` for the interface methods. Tests call the scripted controls directly.

## 6. Grave surface

File: `contracts/src/Grave.sol`. Inherit OpenZeppelin `ReentrancyGuard` (already) and `Ownable2Step`. Do not inherit `Pausable`.

```text
pragma solidity 0.8.36;

constructor(address neth_, address initialOwner_)
    // Ownable(initialOwner_); reject neth_ zero/EOA as today; reject initialOwner_ zero (OZ Ownable)

neth() → NETH                              // unchanged immutable
reaper() → address                         // address(0) until setReaper
owner() / pendingOwner()                   // Ownable2Step

currentEra / currentEraCapacity / currentEraBuried / currentRewardRate / quoteBury
protectedPrincipal()                       // unchanged semantics
totalNethMinted()
currentNAV()                               // idleETH + adapter.totalAssetsInETH() (0 if no adapter)
harvestableYield()                         // max(0, currentNAV - protectedPrincipal)
activeStrategy() → address                 // address(0) until first execute
pendingStrategy() → (adapter, executeAfter) // zeros when none scheduled

bury(uint256 minNethOut) payable           // unchanged mint path; then maybe deposit
harvest() → uint256 ethHarvested           // permissionless; see §7
receive() payable                          // unchanged; no mint, no principal

setReaper(address reaper_)                 // onlyOwner, one-time
scheduleStrategy(address newAdapter)
cancelScheduledStrategy()
executeStrategyMigration()
transferOwnership / acceptOwnership        // Ownable2Step
renounceOwnership()                        // available; W6 must not call it
```

Constructor change: every existing `new Grave(neth)` becomes `new Grave(neth, admin)`. Update unit, fuzz, invariant, and Reaper tests that construct Grave. Era math and burial numbers must stay identical when `activeStrategy() == address(0)`.

OpenZeppelin 5.x `Ownable` takes `initialOwner` in the constructor. `Ownable2Step` does not add a constructor argument.

### 6.1 Views

| View | Behavior |
|---|---|
| `currentNAV()` | `address(this).balance + (activeStrategy == 0 ? 0 : adapter.totalAssetsInETH())` |
| `harvestableYield()` | `max(0, currentNAV() - protectedPrincipal)` |
| `activeStrategy()` | current adapter; `address(0)` at deploy |
| `pendingStrategy()` | scheduled adapter and `executeAfter`; zeroed when none |
| `reaper()` | harvest recipient; `address(0)` until `setReaper` |

If the adapter reverts on `totalAssetsInETH()`, `currentNAV` / `harvestableYield` revert. That is a broken adapter; migrate. Do not cache NAV.

### 6.2 `bury()` and strategy deposit

Burial accounting is unchanged ([`NIP-0004`](0004-grave.md) §4.2): `minNethOut`, `protectedPrincipal += msg.value`, mint, `EraCompleted` / `Buried`, CEI before `neth.mint`.

After mint, if `activeStrategy != address(0)`, try to deposit **all** idle ETH (`address(this).balance`) via `adapter.depositETH{value: idle}()`. On success, emit `StrategyDeposit(strategy, idle)`. On revert, leave ETH idle on Grave and still complete `bury()` ([`NDR-0005`](../ndr/0005-strategy-security.md): no pause escape). Mint and principal accounting must already be done (CEI).

When no adapter, ETH stays on Grave (W2 behavior). Donations received while an adapter is active sit idle until the next successful deposit-on-bury or a migration execute. Do not add a permissionless `deployIdle()` (not in the spec).

### 6.3 Custom errors and events

Use custom errors (spec §18.2). Suggested names, not a protocol requirement:

```text
ZeroAddress()
NotContract()
InsufficientNethOut(uint256 nethOut, uint256 minNethOut)
ReaperAlreadySet()
ReaperNotSet()
NoHarvestableYield()
ZeroHarvest()
StrategyAlreadyPending()
NoPendingStrategy()
StrategyDelayNotElapsed(uint256 executeAfter)
InvalidStrategy()
SameStrategy()
```

OZ `OwnableUnauthorizedAccount` and `ReentrancyGuardReentrantCall` apply as usual.

Spec §13 events to emit from Grave (Reaper events stay on Reaper):

```text
event Buried(...)                         // unchanged
event EraCompleted(...)                   // unchanged
event StrategyDeposit(address indexed strategy, uint256 ethAmount);
event YieldHarvested(uint256 ethAmount, uint256 reaperBalance);
event StrategyMigrationScheduled(address indexed oldStrategy, address indexed newStrategy, uint256 executeAfter);
event StrategyMigrated(address indexed oldStrategy, address indexed newStrategy, uint256 navBefore, uint256 navAfter);
```

Also emit (not in the §13 minimum list):

```text
event ReaperSet(address indexed reaper);
event StrategyMigrationCancelled(address indexed oldStrategy, address indexed newStrategy);
```

Do not emit `EmergencyPause` / `EmergencyUnpause` from Grave ([`NDR-0005`](../ndr/0005-strategy-security.md)).

## 7. Harvest

```solidity
function harvest() external nonReentrant returns (uint256 ethHarvested);
```

Anyone may call it when Reaper is set, and there is positive harvestable yield that can be realized as ETH (spec §7). Production keeper incentive is zero: no tip parameter, no payment from principal.

### 7.1 Amount

```text
reportedHarvestable = max(0, currentNAV - protectedPrincipal)
```

Revert if `reportedHarvestable == 0`.

Do not treat reported adapter NAV as a license to send idle ETH that is still needed as principal. Harvest may send only:

1. **idle surplus** `max(0, address(this).balance - protectedPrincipal)` — donations or undeployed surplus sitting on Grave above the watermark, plus
2. **ETH actually received** from `adapter.withdrawETH` in this transaction (Grave balance delta).

Never pass a `recipient` other than Grave. Cap the withdraw request by `reportedHarvestable - idleSurplus` (0 if idle surplus already covers it). If there is no adapter, only idle surplus can be harvested.

```text
idle            = address(this).balance
idleSurplus     = max(0, idle - protectedPrincipal)
toPull          = reportedHarvestable > idleSurplus ? reportedHarvestable - idleSurplus : 0

if toPull > 0 and activeStrategy != 0:
    balBefore = address(this).balance
    adapter.withdrawETH(toPull, address(this))
    received  = address(this).balance - balBefore
else:
    received  = 0

ethHarvested = idleSurplus + received
```

When principal is in the adapter and idle is below `protectedPrincipal`, `idleSurplus` is 0 and harvest is only `received`. Donations then stay on Grave as backing; surplus comes out of the adapter. That is still yield-only: remaining `idle + adapter assets` should match the honest NAV path.

Revert if `ethHarvested == 0` (reported yield that cannot be realized).

Do not reduce `protectedPrincipal`. Do not mint or burn NETH.

If the adapter reports NAV above what it can withdraw, `received` is smaller and harvest is smaller. If it reports NAV below actual, harvest is smaller and surplus stays as backing. Fabricated NAV is the spec §16.3 trust boundary (a production adapter must price NAV from verifiable balances; a malicious adapter could already steal on `depositETH`). The 14-day schedule is the replacement protection. The idle-surplus cap above is what stops a high-lying NAV from sending idle principal when the adapter pays nothing.

### 7.2 Send to Reaper

Checks-effects-interactions: compute `ethHarvested`, then `Address.sendValue(payable(reaper), ethHarvested)`, then emit `YieldHarvested(ethHarvested, address(reaper).balance)`.

Reaper `receive()` credits `msg.sender == grave` as harvest ([`NIP-0005`](0005-reaper.md) §4.2). ETH that arrives during an active auction stays in `availableReaperETH`, not that auction’s remaining budget.

After realizing and before sending, cap `ethHarvested` at `max(0, currentNAV() - protectedPrincipal)` so the send cannot take reported NAV below principal (spec §6.2 / §7). If `currentNAV() < protectedPrincipal` after realization, revert (`HarvestBreachesPrincipal`). If the cap leaves nothing to send, revert (`ZeroHarvest`). Combined with §7.1, idle principal is not sent when the adapter pays nothing. The cap also covers venues such as Aave aTokens, where `balanceOf` rounding can make a full pre-withdraw surplus pull leave remaining NAV 1 wei short: that wei stays idle on Grave as backing instead of aborting harvest.

### 7.3 Loss then recovery

If `currentNAV < protectedPrincipal`, `harvestableYield() == 0` and `harvest()` reverts, independent of historical yield (spec §6.3). Later gains restore NAV to the watermark first; only value above `protectedPrincipal` is harvestable. No compensatory mint. No recapitalization function.

Zero yield: Reaper receives nothing from Grave; principal and issuance are unchanged (spec §15.3).

## 8. Strategy scheduling and migration

Constant, not a constructor argument:

```text
STRATEGY_CHANGE_DELAY = 14 days
```

One pending slot. `oldStrategy` in events is `activeStrategy` at schedule time (`address(0)` for the first adapter).

### 8.1 `scheduleStrategy(address newAdapter)` (`onlyOwner`)

1. Revert if a pending schedule already exists (`StrategyAlreadyPending`).
2. `newAdapter` must be a non-zero contract and must not equal `activeStrategy`.
3. Store `pending = newAdapter`, `executeAfter = block.timestamp + 14 days`.
4. Emit `StrategyMigrationScheduled(activeStrategy, newAdapter, executeAfter)`.

The first adapter (from `address(0)`) also waits 14 days. Spec §10.2: strategy changes execute only through the required delay.

### 8.2 `cancelScheduledStrategy()` (`onlyOwner`)

Spec §11’s admin component includes propose/cancel. Spec §16.1 requires tests for governance key compromise and migration to an asset-stealing adapter. Execute is `onlyOwner` (spec §10.2), so a recovered admin can refuse to execute, but a poison pending slot would block a replacement schedule without cancel.

1. Revert if none pending.
2. Emit `StrategyMigrationCancelled(activeStrategy, pending)`.
3. Clear the pending slot.

Cancel is how a recovered admin clears a bad schedule and posts another (new 14-day clock). There is no Grave pause to freeze execute; refusing to call execute, or cancelling, is the delay-window response.

### 8.3 `executeStrategyMigration()` (`onlyOwner`, `nonReentrant`)

One transaction. A revert undoes storage writes and native-ETH sends.

```text
require owner, pending set, block.timestamp >= executeAfter
old = activeStrategy; new = pending adapter
navBefore = currentNAV()
if old != 0: try/catch withdrawETH(old.totalAssetsInETH(), address(this))
    // on revert, continue with ETH already on Grave
    // (spec §6.5 “recoverable”; §16.1 deprecated-strategy escape)
idle = address(this).balance
activeStrategy = new; clear pending
if idle > 0: new.depositETH{value: idle}()    // revert undoes the slot write
navAfter = currentNAV()
emit StrategyMigrated(old, new, navBefore, navAfter)
emit StrategyDeposit(new, idle)               // if idle > 0
```

Verify actual ETH received from the old adapter by Grave’s balance delta, not only the returned `received` (spec §16.3). Never pass `owner()` as `recipient`.

Post-migration verification (spec §6.5):

- recovered ETH went to Grave, then into the new adapter, never to `owner()`;
- the deposited adapter is the address fixed at schedule time;
- do **not** require `navAfter >= navBefore` (losses are allowed);
- do **not** require `navAfter >= protectedPrincipal` (migration must still escape a deficit or deprecated adapter).

### 8.4 What migration must not do

- no principal to the multisig, deployer, or any EOA
- no second active adapter
- no changing era parameters, NETH, Reaper curve, or `protectedPrincipal`
- no skipping the 14-day delay, including for the first adapter
- no executing a different address than the one scheduled

## 9. No protocol pause

Grave and Reaper have no `pause` / `unpause`. Spec §6.5 MAY is unused here ([`NDR-0005`](../ndr/0005-strategy-security.md)).

| Operation | Always allowed (subject to its own checks) |
|---|---|
| `bury()` | yes; `depositETH` try/catch — idle on revert |
| NETH `transfer` / `approve` / `burn` | yes |
| `harvest()` | yes, when harvestable ETH is realizable |
| `executeStrategyMigration()` | yes, after 14 days, `onlyOwner` |
| `Reaper.startAuction` | yes, when `availableReaperETH > 0` |
| `sellToReaper` / `finalizeAuction` | yes |
| principal `withdraw` | no such function exists |

## 10. Reaper change

File: `contracts/src/Reaper.sol`. Do not add `Ownable`, `Pausable`, harvest, a strategy slot, or a `grave.paused()` check.

W4 harvest already works: Grave sends ETH; `receive()` credits `msg.sender == grave`. Do not change auction math.

Existing Reaper tests: update Grave constructor arguments (`initialOwner`). Keep asserting Reaper itself has no `pause` / `owner` / `harvest` / `withdraw`. `startAuction` must succeed while a hypothetical caller might have wanted Grave paused — there is no such flag.

## 11. What W4 must not do

Spec §2, §6, §10, §16, §20:

- no ETH redemption, `withdraw` of principal to burier or admin
- no admin mint of NETH; owner cannot call `neth.mint`
- no pause of ordinary ERC-20 transfers
- no `Pausable` on Grave or Reaper; no `startAuction` pause check
- no spending protected principal via harvest or migration
- no redirect of Reaper ETH
- no `TimelockController` / extra `StrategyManager` deploy in this slice
- no production adapter in `src/strategy/`
- no test adapter in `src/`
- no proxy, UUPS, Beacon, or upgradeable OZ modules
- no constructor-configurable era, Reaper curve, harvest fee, or delay
- no keeper tip from principal
- no DEX, NETH oracle, or second simultaneous adapter
- no changing `NETH.sol` or `EraMath.sol`

## 12. Tree

Follow [`NIP-0001`](0001-scaffolding.md). Production adapter directory stays empty.

```
contracts/
├── src/
│   ├── NETH.sol                         unchanged
│   ├── Grave.sol                        extended (harvest, strategy slot, owner)
│   ├── Reaper.sol                       unchanged auction math; harvest already via receive()
│   ├── interfaces/
│   │   └── IStrategyAdapter.sol         unchanged (§6.4)
│   ├── libraries/
│   │   └── EraMath.sol                  unchanged
│   └── strategy/                        still empty (W5)
└── test/
    ├── unit/
    │   ├── NETH.t.sol                   unchanged
    │   ├── EraMath.t.sol                unchanged
    │   ├── Grave.t.sol                  constructor + bury-without-strategy still valid; harvest/owner exist; pause absent
    │   ├── Reaper.t.sol                 Grave constructor only
    │   └── Strategy.t.sol               harvest, migration, test adapter
    ├── fuzz/
    │   ├── Grave.t.sol                  constructor; principal properties still hold
    │   ├── Reaper.t.sol                 constructor
    │   └── Strategy.t.sol
    ├── invariant/
    │   ├── Grave.t.sol                  no-strategy handler still valid (update Grave ctor)
    │   ├── Reaper.t.sol                 update Grave ctor
    │   └── Strategy.t.sol               bury, harvest, donate, schedule/cancel/execute, adapter P/L, auctions
    └── mocks/
        ├── GraveStub.sol                unchanged
        └── TestInvestAdapter.sol
```

Do not add `src/interfaces/IGrave.sol`. W7 can call `Grave` / `Reaper` directly.

Suggested Grave internals (reshape as needed):

```text
_idleETH() → uint256
_strategyAssets() → uint256
_deployIdle()                         // deposit address(this).balance when adapter set; catch revert
_realizeHarvest() → uint256           // §7.1; one path for harvest()
_collectFromAdapter(uint256 amount) → uint256 received
```

## 13. Tests

Spec §17: tests that introduce the behavior ship with the slice. W4 does not run Base fork tests or the production-adapter suite (W5). Existing burial/Reaper suites must stay green after the Grave constructor change.

Replace `Grave.t.sol` `test_noWithdrawRedeemHarvestPauseOrOwner` with: no `withdraw` / `redeem` / `unstake` / `pause` / `unpause`; `harvest` and `owner` **do** exist. Keep “no withdraw of principal”.

When `activeStrategy() == address(0)`, `currentNAV() == address(this).balance` as in W2. Invariant `currentNAV >= protectedPrincipal` remains true **without** a loss-making adapter; the strategy invariant handler must **not** assert that globally (spec §6.3).

### 13.1 Unit — `Strategy.t.sol` / extended `Grave.t.sol`

Wiring:

- genesis: `activeStrategy() == 0`, `reaper() == 0`, `owner() == admin`; no `paused()`
- `setReaper` reverts for zero, EOA, second call, and non-owner; after success `ReaperSet` and harvest path works
- `harvest` before `setReaper` reverts
- `transferOwnership` / `acceptOwnership`; `renounceOwnership` succeeds in a unit test (owner becomes 0) but W6 must not use it
- non-owner cannot `scheduleStrategy`, `executeStrategyMigration`, `setReaper`

NAV and harvest:

- no strategy: donation increases `currentNAV` and `harvestableYield`; `harvest` sends idle surplus to Reaper; `protectedPrincipal` unchanged; Reaper `totalHarvestedETH` increases, `totalDonatedETH` does not
- NAV below principal: `harvestableYield() == 0`; `harvest` reverts; principal unchanged
- NAV equal principal: `harvest` reverts
- NAV above principal: harvests the surplus only; post-harvest `currentNAV >= protectedPrincipal`
- loss then recovery: adapter `simulateLoss` below principal → no harvest; `simulateProfit` back above → only the excess is harvestable
- reported NAV high, realizable low: harvest equals actual withdrawn + idle surplus, not the lie
- adapter `withdrawETH` recipient is Grave; admin balance does not increase
- `YieldHarvested` amount matches ETH gained on Reaper
- `harvest` is `nonReentrant` (malicious adapter or Reaper `receive` attempting reenter fails)
- zero-yield solvency: only burials, no profit → Reaper gets nothing from `harvest` (revert / zero harvestable); principal equals cumulative `bury` `msg.value`

Deposit on bury:

- with adapter set, `bury` leaves Grave idle ~0 and adapter `totalAssetsInETH` increased; `StrategyDeposit` emitted
- reverting adapter: `bury` still mints and raises principal; ETH stays idle on Grave

Scheduling / migration:

- `scheduleStrategy` sets `executeAfter = now + 14 days`; emit `StrategyMigrationScheduled`
- `executeStrategyMigration` before 14 days reverts; after warp, owner executes
- first adapter from `address(0)` still waits 14 days
- second `scheduleStrategy` while pending reverts; `cancelScheduledStrategy` clears; a new schedule starts a new 14-day clock
- non-owner schedule/execute/cancel reverts
- migration withdraws from old → Grave → new; owner ETH unchanged; `StrategyMigrated` has `navBefore` / `navAfter`
- `navAfter < navBefore` allowed (loss during migration)
- reverting old `withdrawETH`: execute continues (best effort); ETH stuck in the old adapter is missing from NAV; owner balance unchanged
- scheduled address is the one executed; cannot swap in a different adapter at execute
- no path sends recovered ETH to `owner()`

Test adapter:

- `depositETH` / `withdrawETH` revert for non-Grave
- `underlying() == address(0)`
- not imported from `src/strategy/`

Absence:

- no `withdraw(uint256)` / `redeem` / `unstake` on Grave
- no pause functions on Grave, NETH, or Reaper
- no harvest fee / tip parameter

### 13.2 Fuzz / property

```text
protectedPrincipal never decreases
protectedPrincipal increases by exactly msg.value on successful bury
harvest never decreases protectedPrincipal
harvest never sends idle ETH that is required as principal (§7.1)
post-successful-harvest currentNAV >= protectedPrincipal for an honest adapter
Reaper can never spend Grave principal
no admin path can mint NETH
owner / migration cannot transfer principal to owner
schedule cannot be executed before 14 days
executed adapter == scheduled adapter
only one activeStrategy
donated ETH never mints NETH and never increases protectedPrincipal
quoteBury(eth) == bury output at the same pre-state
era reward rate never increases
```

Assume callers, amounts, warps across the 14-day delay, adapter profit/loss, and NAV-override lies (withdraw still capped by real ETH).

### 13.3 Invariant (`test/invariant/Strategy.t.sol`)

Stateful handler: random `bury`, donations to Grave and Reaper, `harvest`, `startAuction` / `sellToReaper` / `finalizeAuction`, `scheduleStrategy` / `cancelScheduledStrategy` / `executeStrategyMigration` (with warps), and test-adapter `simulateProfit` / `simulateLoss` / `setReportedNav`.

Invariants: §13.2 properties that remain globally true, plus `neth.balanceOf(reaper) == 0` except inside settlement, and `protectedPrincipal` equals cumulative successful `bury` `msg.value`. Do **not** assert `currentNAV >= protectedPrincipal` once loss actions are in the handler.

Keep `test/invariant/Grave.t.sol` as the no-strategy suite (update constructor only; bury still credits Grave’s ETH balance). Do not put adapter selectors into that handler.

### 13.4 §15.3 yield scenarios

Foundry tests with `TestInvestAdapter`, not a Python sim and not a Base fork:

| Scenario | Setup | Assert |
|---|---|---|
| 0.0% | burials only | `harvest` cannot pull principal; Reaper `totalHarvestedETH` unchanged from Grave |
| 1.0% / 1.5% / 2.2% / 3.0% | scripted profit ≈ `principal * y` | harvest sends that surplus (within rounding) to Reaper; principal unchanged; issuance unchanged |

These are scenario tests, not promised returns (spec §15.2). Full era-table annual-budget commentary can stay off-chain; W4 proves the accounting identity `harvested <= max(0, NAV - principal)` under those yields.

### 13.5 Not in W4

- Base fork tests, canonical WETH, AAVE pool (W5)
- deploy-script abort checks (W6)
- accepting NDR-0002
- production adapter risk analysis (§22 item 7) beyond the test adapter

Existing CI already runs `forge fmt --check`, `forge build --sizes`, and `forge test -vvv` from `contracts/`. Do not add a second workflow.

## 14. Implementation steps

Do not run these until this NIP is explicitly started.

1. Extend `contracts/src/Grave.sol` as in §6–§9: `Ownable2Step`, `setReaper`, harvest, schedule/cancel/execute, deposit-on-bury with try/catch. `pragma solidity 0.8.36;`. SPDX `UNLICENSED` ([NDR-0004](../ndr/0004-source-available-until-mainnet.md)). Import `IStrategyAdapter`; do not import `Reaper.sol` (send ETH to the stored address). Do not add `Pausable`.
2. Do not change `Reaper.startAuction`. Do not add owner/pause on Reaper.
3. Add `contracts/test/mocks/TestInvestAdapter.sol` as in §5.
4. Update every `new Grave(neth)` to `new Grave(neth, admin)` in existing tests. Adjust the Grave unit test that asserted harvest/pause/owner were absent: harvest/owner exist; pause does not.
5. Add unit, fuzz, invariant, and §15.3 tests in §13.
6. Do not change `NETH.sol`, `EraMath.sol`, `IStrategyAdapter.sol`, `foundry.toml`, remappings, OpenZeppelin/forge-std pins, or CI versions. Leave `src/strategy/` empty.
7. From `contracts/`: `forge fmt`, `forge build`, `forge test`.

## 15. Acceptance criteria

W4 is done when:

- `IStrategyAdapter` is still the spec §6.4 surface; no adapter NDR was opened because the surface did not change
- `TestInvestAdapter` lives under `contracts/test/mocks/` and is not a production deploy target
- `currentNAV` includes adapter assets; `harvestableYield` is 0 when NAV ≤ principal
- `harvest()` is permissionless, non-reentrant, sends only surplus ETH to Reaper, and never decreases `protectedPrincipal`
- loss-recovery-first holds on the test adapter
- donations / forced ETH do not mint and do not raise `protectedPrincipal`; they may become harvestable only as NAV surplus
- strategy changes are scheduled on-chain, wait 14 days, execute only the scheduled adapter, and route recovered ETH Grave → new adapter, never to admin
- pause is absent on Grave and Reaper; `startAuction` does not read a Grave pause flag
- Grave admin is `Ownable2Step`; Reaper and NETH have no owner; `renounceOwnership` remains available (W6 must not call it)
- `NETH.sol` and `EraMath.sol` are unchanged; `src/strategy/` is still empty
- `forge fmt --check`, `forge build`, and `forge test` pass from `contracts/`
- NDR-0002 is still Proposed unless it is explicitly accepted in a later change

## 16. Not decided here

Leave these to later NIPs / NDRs, as queued in [`NIP-0000`](0000-the-roadmap.md):

- production adapter implementation (W5; [`NIP-0007`](0007-aave-adapter.md), venue [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md))
- any `IStrategyAdapter` surface change (only if W5 proves §6.4 insufficient — then an NDR, not a silent edit)
- which Base multisig-capable account receives ownership (W6; reuse existing infrastructure)
- CREATE2, cost script, explorer verification (W6)
- accepting the compiler / OZ / Foundry freeze (NDR-0002)
- keeper ([`NIP-0009`](0009-grave-keeper.md))
- later safer meta-adapter internals and the moment Grave owner is set to `address(0)` ([`NDR-0005`](../ndr/0005-strategy-security.md))

Pause-of-auction-creation is **not** in this slice ([`NDR-0005`](../ndr/0005-strategy-security.md)). Strategy slot on Grave, harvest-with-W4, and the test invest adapter are already in [`NIP-0000`](0000-the-roadmap.md). `IStrategyAdapter` is spec §6.4. 14-day delay, yield-only Reaper, and loss-recovery-first are spec §6–§7 / §10 / §21. One-time `setReaper` matches the §18.3 deploy order and the NETH `setGrave` shape. `Ownable2Step` is the module [`NIP-0001`](0001-scaffolding.md) reserved for W4; `Pausable` is not. Embedded delay rather than `TimelockController` follows spec §18.2 and NIP-0001 §5. Immediate harvest transfer is spec §6.2’s `alreadyReservedForReaper` after ETH has left Grave. Cancel of a pending schedule is spec §11 propose/cancel plus §16.1 key-compromise / thief-adapter tests.

W5 implements `src/strategy/` against this same interface. W6 transfers `owner()` off the deployer EOA and must not stack a second 14-day `TimelockController` on top of Grave’s delay, and must not `renounceOwnership` at launch.
