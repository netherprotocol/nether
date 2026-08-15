# NIP-0008: End-to-end Base fork suite

- Status: Draft (do not implement until this NIP is explicitly started)
- Date: 2026-08-15
- Workstream: M0 fork gate (after W5)
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Venue: Accepted [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md)
- Pool lookup: Accepted [`NDR-0007`](../ndr/0007-aave-pool-via-provider.md)
- Strategy admin: Accepted [`NDR-0005`](../ndr/0005-strategy-security.md)
- Adapter: Implemented [`0007-aave-adapter.md`](0007-aave-adapter.md)
- Working versions: Proposed [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md) (not accepted)
- License: [`NDR-0004`](../ndr/0004-source-available-until-mainnet.md) (`SPDX-License-Identifier: UNLICENSED`)

This plan is the family-level Base fork suite. Spec §17 already requires fork tests for canonical WETH, the selected adapter, harvest realization, strategy migration, and real decimals/index. [`NIP-0007`](0007-aave-adapter.md) §9.3 ships adapter-focused checks and migrates through `TestInvestAdapter`. This NIP adds one natural lifecycle against **live** Base WETH9 and Aave V3 Core, covering NETH, Grave, Reaper, and `AaveV3WethAdapter` together.

It does not change production contracts, era math, harvest rules, or Reaper economics. It does not replace the W5 adapter fork file.

## 1. Purpose

Prove the deployed-shape protocol works on current Base state: configure contracts the way §18.3 wires them, bury ETH for NETH, cross era boundaries by filling capacity, donate ETH to Grave and Reaper with spec §16.2 accounting, put Grave ETH into Aave via WETH9, harvest real supply yield into Reaper, run reverse Dutch auctions, migrate between two live Aave adapters, and hand off `Ownable2Step` ownership. Every beat uses public functions and real token/pool accounting. Fail the suite if Aave does not actually pay; do not skip and do not fake NAV.

W5 already covers adapter pins, wrap/unwrap, collateral-off, and a mock round-trip. This suite is the M0 integration gate those tests do not provide (era crossings, donations, Reaper auctions, ownership change, idle-then-deploy, Aave-to-Aave migration).

Default `forge test` stays RPC-free. This suite stays under `test/fork/**` and the existing `fork` CI job.

## 2. Scope

In scope:

- `contracts/test/fork/ProtocolE2E.t.sol` (one file)
- One primary sequential lifecycle test that starts from deploy and walks the full flow
- Helpers that only wrap public calls, time, and ETH for test actors
- Era completions via `bury()` only (`EraCompleted`, `currentEra`, reward rate never increases)
- Direct ETH donations to Grave and Reaper (spec §16.2), distinct from Aave harvest
- Live Base pins from [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md) / [`NDR-0007`](../ndr/0007-aave-pool-via-provider.md): canonical WETH, PoolAddressesProvider, expected Pool, aBasWETH, variableDebtWETH
- Keep [`NIP-0007`](0007-aave-adapter.md) `test/fork/AaveV3WethAdapter.t.sol` as the adapter-focused suite

Out of scope:

- Changing `NETH.sol`, `Grave.sol`, `Reaper.sol`, `AaveV3WethAdapter.sol`, `IStrategyAdapter.sol`, or `EraMath.sol`
- `TestInvestAdapter`, `simulateProfit` / `simulateLoss` / `setReportedNav`, or any mock Pool/WETH in this file
- `vm.store`, `stdstore`, `vm.etch`, `vm.mockCall`, `deal` of aTokens/WETH onto the adapter, or `skip` / `vm.skip` when yield is zero
- Deploy scripts, CREATE2, cost abort (W6)
- Economic simulation, new invariant handlers, fuzz
- Accepting NDR-0002
- A second CI workflow or a pinned historical block (see §3.3)
- Frontend, keeper, Sepolia

Do not add a production helper contract so tests can “seed” yield.

## 3. Architecture choices

These shapes are authorized for this suite. Spec and accepted NDRs win if anything below disagrees.

### 3.1 New file, keep the W5 adapter fork tests

| Shape | Why not |
|---|---|
| Fold the lifecycle into `AaveV3WethAdapter.t.sol` | That file’s `setUp` already schedules and executes the adapter; init, Reaper, and ownership would be hidden or duplicated. |
| Replace the W5 file | W5 still owes adapter-only pins, borrow-selector absence, and the mock migration path in [`NIP-0007`](0007-aave-adapter.md) §9.3. |
| New `test/fork/ProtocolE2E.t.sol` (chosen) | Family lifecycle in one place; W5 file stays the adapter checklist. |

### 3.2 One sequential lifecycle, not isolated `setUp` pre-wiring

The existing adapter fork tests wire `setGrave` / `setReaper` / first migration in `setUp`. That is fine for adapter checks. It is the wrong shape for “test all flows naturally.”

`setUp` in this file only:

1. `vm.createSelectFork("base")` (or `--fork-url`)
2. Read `provider.getPool()` and assert it matches the NDR-0007 pin and `aWeth.POOL()`
3. `makeAddr` for setter, deployer admin, successor admin, alice, bob, donor, whale
4. `vm.deal` ETH to those EOAs (actors need gas and burial ETH)

The test body deploys and calls. Shared helpers (`_deployFamily`, `_warpDelay`, `_pokeAaveWethIndex`, `_induceAaveSupplyYieldIfNeeded`) are allowed; they must not write Nether or Aave storage.

Negative checks belong **in the beat where they are natural** (harvest before yield, execute before 14 days, old owner after handoff). Do not add a second file of isolated unit-style fork tests.

A second test function in the same file is allowed only if the primary lifecycle would become unreadable. It must still start from `_deployFamily()` and use only public APIs. Do not pre-execute strategy in `setUp`.

### 3.3 Latest Base head, not a pinned block

| Shape | Why not |
|---|---|
| Pin a historical block in the test | Stale utilization / pause / cap vs “it works on chain now”; W6 can pin later for §22 artifact freeze. |
| Latest Base (chosen) | Matches [`NIP-0007`](0007-aave-adapter.md) §9.3 and `foundry.toml` `rpc_endpoints.base`. If Aave WETH is paused, capped, or not accruing, the suite **fails**. |

Do not treat RPC flakiness as a skip. Retry is a CI/RPC concern, not a test branch.

### 3.4 Real Aave on both sides of migration

Spec §20: one **active** adapter. Two `AaveV3WethAdapter` instances (same provider/WETH/aWETH, different Grave-bound contracts) is the production-shaped migration: withdraw/unwrap from Aave, ETH through Grave, wrap/supply on the next adapter.

| Shape | Why not |
|---|---|
| Migrate to `TestInvestAdapter` | Idle ETH mock; not real chain accounting. Keep that path in the W5 file only. |
| Invent a second venue (wstETH, Morpho) | Out of W5; would need an NDR. |
| Two `AaveV3WethAdapter` clones (chosen) | Live WETH9 + Aave both before and after; still one `activeStrategy`. |

Do not deploy the second adapter until the migration beat. Constructor args are `(grave, provider, weth, aWeth)` as in W5.

### 3.5 Environment cheats vs internal state

Allowed (test environment, not protocol storage):

- `vm.createSelectFork`
- `vm.prank` / `vm.startPrank`
- `vm.warp` / `vm.roll` (14-day delay, 7-day auction, Aave accrual time)
- `vm.deal` of **native ETH to EOA actors** (and to a poke whale)
- `makeAddr`
- Calling live WETH9 / Aave Pool from a whale to update the liquidity index or, if needed, create WETH utilization (§3.6)

Forbidden:

- `vm.store` / `stdstore` on NETH, Grave, Reaper, adapters, WETH, Aave
- `vm.etch`, `vm.mockCall`, `vm.expectCall` as a substitute for an assert on balances
- `deal(aWeth, adapter, …)` or `deal(weth, adapter, …)`
- `TestInvestAdapter` scripted P/L
- `skip`, `vm.skip`, or `if (harvestable == 0) { /* no harvest */ }` as a passing branch
- Calling `adapter.depositETH` / `withdrawETH` as a test actor (only Grave may; the flow is `bury` / `harvest` / `executeStrategyMigration`)
- Donating ETH to Reaper or Grave **instead of** Aave harvest to fund the Aave-yield auction (donations are required beats, §3.10; they must not stand in for adapter yield)

`vm.expectRevert` on a public call is allowed.

### 3.6 Harvest must realize live Aave yield

Aave supply yield is index growth, not a transfer. Warping without a reserve touch can leave `aWETH.balanceOf` unchanged until someone supplies/withdraws.

Do **not** use Grave `receive()` donations or Reaper donations to stand in for harvest in this suite.

Sequence:

1. After ETH is in aWETH, record `nav0 = adapter.totalAssetsInETH()` and `principal = grave.protectedPrincipal()`.
2. `vm.warp` forward **90 days** (long enough that Base WETH supply APY should print more than 1 wei on a large bury).
3. Poke the WETH reserve with a **real** wrap + tiny `Pool.supply` from a whale (same idea as NIP-0007 `_pokeReserve`). Optionally a second tiny supply/withdraw so the index is written.
4. Require `adapter.totalAssetsInETH() > nav0` and `grave.harvestableYield() > 0`. Then `harvest()`.

If step 4 is still zero because live utilization is ~0, `_induceAaveSupplyYieldIfNeeded` MAY, from the **whale only** (never the adapter):

- `WETH.deposit`, `approve`, `Pool.supply` WETH as collateral (leave collateral enabled on the whale)
- `Pool.borrow` a modest WETH amount so the reserve has utilization
- warp again (e.g. another 30 days) and poke

That helper needs a **test-only** Aave borrow slice (`borrow` / `repay` / `getUserAccountData` as required). Do not add `borrow` to `contracts/src/interfaces/IAaveV3Pool.sol`. Put the extra ABI in the fork test file (or a `test/`-only interface). After inducing, the whale should `repay` so the test does not leave an unexplained open loan as an assertion dependency; leftover whale debt is not a protocol invariant.

If yield is still zero after induce + poke, **fail**. That is a real-chain finding (pause, cap, zero utilization that borrow could not open, RPC, or adapter bug).

Harvest asserts (spec §6.2–§7):

- `ethHarvested > 0`
- `reaper.totalHarvestedETH` increased by that amount; `totalDonatedETH` unchanged by this call
- `grave.protectedPrincipal()` unchanged
- `grave.currentNAV() >= grave.protectedPrincipal()`
- admin / successor ETH unchanged
- `variableDebtWETH.balanceOf(adapter) == 0`

Principal in Aave should still be large enough to print harvestable wei after 90 days. Reach about **50 ETH** protected principal through the era-filling buries in §3.9 / beat 5, not one undifferentiated lump.

### 3.7 Reaper auction is funded by that harvest

Spec: any positive `availableReaperETH` may start an auction; no minimum budget. This suite still wants a **visible** fill:

1. `bob.startAuction()` (permissionless). Snapshot `R = grave.currentRewardRate()` at start; `currentReaperRate() == 2.00 * R` at elapsed 0.
2. The seller approves NETH and `sellToReaper` a **partial** fill (`minEthOut` from `quoteReaperSale`). Assert NETH burned (`totalSupply` down, seller balance down, `neth.balanceOf(reaper) == 0`), ETH paid to the seller, `totalNethReaped` up, auction `ethRemaining` down. After beat 3 alice may have sold her era-0 NETH; the Aave-funded auction seller is **bob**.
3. Warp to auction end (7 days). `finalizeAuction()`. Unspent ETH rolls to `availableReaperETH`; auction inactive.
4. Follow-on `startAuction` after the mid-auction Reaper donation (§3.10 / beat 7) is required.

Do not `vm.store` auction fields. Do not `deal` or donate ETH onto Reaper to start the **Aave-yield** auction; that auction’s budget is `harvest()` from the adapter. The earlier donation-surplus auction in beat 3 is a separate beat.

Warp inside the Aave-funded auction to a midpoint and assert the rate moved seller-favorable (`currentReaperRate` decreased toward `1.05 * R`) before the partial sell. Midpoint is required so the curve is observed on-chain.

### 3.8 Ownership change is `Ownable2Step`, then the successor migrates

Spec §18.3 step 12: administrative authority leaves the deployer EOA. [`NIP-0006`](0006-strategy.md): `transferOwnership` / `acceptOwnership`; do not `renounceOwnership` (W6 must not).

Beat:

1. After harvest/auction, `admin.transferOwnership(successor)`; successor is still not owner.
2. `successor.acceptOwnership()`; `grave.owner() == successor`.
3. `admin.scheduleStrategy` reverts (`OwnableUnauthorizedAccount`).
4. Successor deploys adapter B, `scheduleStrategy(adapterB)`, warp 14 days, `executeStrategyMigration()`.

Successor, not deployer, is the only admin who may complete migration in this suite. That is the production-shaped handoff.

### 3.9 Era changes are `bury()` filling capacity

Do not `vm.store` `currentEra`. Complete eras by burying the remaining capacity (spec §5). Era 0 capacity is 10 ETH; each next era doubles capacity and halves `currentRewardRate()`. Reward rate must never increase.

Required crossings in the primary test:

| Step | Bury | Expected |
|---|---|---|
| Stay in era 0 | 1 ETH | `currentEra == 0`; no `EraCompleted` |
| Fill era 0 | remaining 9 ETH | `EraCompleted(0, …)`; `currentEra == 1`; rate halved |
| Fill era 1 | 20 ETH | `EraCompleted(1, …)`; `currentEra == 2`; rate halved again |
| Partial era 2 | 20 ETH (capacity 40) | `currentEra` stays 2; no further `EraCompleted` |

Quote `minNethOut` immediately before each bury. After each completion, `currentRewardRate()` equals `EraMath` / spec §5.1 for the new era. `protectedPrincipal` increases by exactly `msg.value`. NETH minted matches `quoteBury` at the pre-state.

**Sticky Reaper R (spec §8.4):** during the Aave-funded auction, bury enough to complete the *next* era (era 2 remainder 20 ETH, or whatever remainder is left). `grave.currentRewardRate()` must change; `activeAuction.snapshottedRewardRate` and `currentReaperRate()` must not. That bury also deposits into the live adapter.

A single 50 ETH bury that happens to cross eras is **not** enough. The table above is the era suite; a lump can supplement TVL but must not replace the explicit boundaries.

### 3.10 Donations to Grave and Reaper (spec §16.2)

Donations are first-class beats. They are not a substitute for Aave harvest (§3.6) and they are not `deal` onto the contracts (use `donor.call{value: amount}("")` to the payable target so `receive()` runs).

**Grave** (`receive()`; no mint, no principal):

1. **Before a strategy.** After the era-0 1 ETH bury, `donor` sends 0.5 ETH to Grave. Assert `neth.totalSupply` unchanged, `protectedPrincipal` unchanged, `currentNAV` and `harvestableYield` up by 0.5, idle ETH up by 0.5. Then `harvest()`: idle surplus goes to Reaper; `reaper.totalHarvestedETH` += 0.5; `reaper.totalDonatedETH` unchanged (sender is Grave). Principal still 1 ETH, idle 1 ETH, harvestable 0.
2. **Clear that ETH with a short auction** before the Aave-funded auction (beat 3): `startAuction`, alice sells NETH to fill (or fill most of) the 0.5 ETH, warp 7 days, `finalizeAuction`. After this, `availableReaperETH` is 0 (or dust rollover only). Later Aave harvest is then a distinct Reaper credit.
3. **While an adapter holds principal (beat 10, after migration).** `donor` sends ETH to Grave. Assert no mint, principal unchanged, idle on Grave (not auto-deposited; there is no `deployIdle()`). `idleSurplus` is 0 because idle < `protectedPrincipal`. The next `bury()` deploys **all** idle (donation + new bury) into the adapter; aWETH rises by that sum; principal rises by the bury only. Do not insert this donation before the Aave harvest/auction beats — extra idle NAV would make pre-warp `harvest()` succeed without Aave yield.

**Reaper** (direct `receive()` from non-Grave):

1. **During the Aave-funded auction.** `donor` sends ETH to Reaper. Assert `totalDonatedETH` and `availableReaperETH` increase, `totalHarvestedETH` unchanged, `ReaperDonation` emitted, **auction `ethRemaining` / `ethBudget` unchanged**. ETH that arrives mid-auction is not that auction’s budget ([`NIP-0005`](0005-reaper.md) §4.2).
2. After `finalizeAuction`, that donation (plus rollover) is startable as the next auction’s budget. Starting that follow-on auction is required so donated ETH is shown to be spendable without being mis-tagged as harvest.

Do not `deal` ETH onto Reaper or Grave to simulate donations (that skips `receive()` and is the surplus/`collectSurplus` path, which unit tests already cover). Do not credit a Grave donation as `totalDonatedETH` on Reaper.

## 4. Lifecycle (primary test)

Name: `test_protocolLifecycleOnBaseFork`. File: `contracts/test/fork/ProtocolE2E.t.sol`. `pragma solidity 0.8.36`. SPDX `UNLICENSED`.

Actors: `setter`, `admin` (deployer owner), `successor`, `alice` (first burier / first-auction seller), `bob` (era burier / second-auction seller / auction starter), `donor` (Grave and Reaper ETH), `whale` (Aave poke / optional borrow).

Pins (same as W5; re-read at runtime, do not assume Pool storage on the adapter):

| Role | Address |
|---|---|
| Canonical WETH | `0x4200000000000000000000000000000000000006` |
| PoolAddressesProvider | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` |
| Pool (expected `getPool()`) | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| aBasWETH | `0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7` |
| variableDebtWETH | `0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E` |

### Beat 0 — fork and pins

Assert `provider.getPool() == aWeth.POOL() == EXPECTED_POOL`, `aWeth.UNDERLYING_ASSET_ADDRESS() == WETH`, WETH and aWETH `decimals() == 18`. Wrap 1 ETH on WETH9 from the test contract or whale and unwrap 1:1 (canonical WETH, spec §17).

### Beat 1 — deploy and wire (spec §18.3 order, without CREATE2)

```text
neth     = new NETH(setter)
grave    = new Grave(neth, admin)
reaper   = new Reaper(neth, grave)
adapterA = new AaveV3WethAdapter(grave, provider, weth, aWeth)

assert neth.grave() == 0
assert grave.reaper() == 0
assert grave.activeStrategy() == 0
assert grave.owner() == admin
assert neth.totalSupply() == 0
assert grave.protectedPrincipal() == 0

setter: neth.setGrave(grave)
admin:  grave.setReaper(reaper)

assert neth.grave() == grave
assert neth.graveSetter() == 0
assert grave.reaper() == reaper
assert adapterA.underlying() == weth
assert adapterA.grave() == grave
```

`setGrave` / `setReaper` second call reverts (natural lock). Non-owner `setReaper` reverts.

Do not schedule the strategy yet.

### Beat 2 — bury ETH before a strategy (idle on Grave, stay in era 0)

`alice.bury{value: 1 ether}(minNethOut)` with `minNethOut = grave.quoteBury(1 ether)` immediately before the call.

Assert:

- `neth.balanceOf(alice) == nethOut == quote` at the pre-state
- `grave.protectedPrincipal() == 1 ether`
- `address(grave).balance == 1 ether` (idle; no adapter)
- `grave.currentEra() == 0`
- `grave.currentRewardRate()` is the era-0 rate (1_000_000 NETH per ETH)
- no `EraCompleted`
- `adapterA.totalAssetsInETH() == 0`
- `neth.mint` from alice reverts (`NotGrave`)

This is “burying ETH, minting NETH.” There is no `buryNeth`.

### Beat 3 — donate to Grave, harvest idle surplus, donation-funded auction

Follow §3.10 item 1: `donor` sends 0.5 ETH to Grave. No mint, principal unchanged, NAV 1.5 ETH. `harvest()` pays 0.5 ETH to Reaper as **harvested** yield (`totalHarvestedETH`, not `totalDonatedETH`).

Then follow §3.10 item 2: `bob.startAuction()`. Snapshot era-0 `R`. Alice `sellToReaper` fills that 0.5 ETH budget (at t=0, 2.00 * R, 1 ETH of era-0 NETH buys 0.5 ETH — she may sell all or part). Warp 7 days. `finalizeAuction()`. `availableReaperETH == 0` (or only dust rollover). `neth.balanceOf(reaper) == 0`.

Do not start the Aave-yield auction yet.

### Beat 4 — first adapter: schedule, delay, execute (idle ETH into Aave)

`admin.scheduleStrategy(adapterA)`. Assert `pendingStrategy` adapter and `executeAfter == block.timestamp + 14 days`.

`admin.executeStrategyMigration()` **before** warp reverts (`StrategyDelayNotElapsed`).

Warp 14 days. `admin.executeStrategyMigration()`.

Assert:

- `activeStrategy == adapterA`, pending cleared
- Grave idle ~0
- `aWeth.balanceOf(adapterA) ≈ 1 ether` (wei rounding, `assertApproxEqAbs(..., 2)` is enough)
- `grave.currentNAV()` ≈ `protectedPrincipal`
- `grave.currentEra() == 0` still
- `variableDebtWETH.balanceOf(adapterA) == 0`
- admin ETH unchanged

This is “depositing Grave into strategy” via migration from `address(0)`.

### Beat 5 — era changes after adapter (deposit-on-bury)

Follow the table in §3.9. `bob` (or alice) buries with `minNethOut = quoteBury` each time. Each bury leaves Grave idle ~0 and increases aWETH by ≈ `msg.value`. `protectedPrincipal` tracks cumulative bury ETH only (still 1 + 9 + 20 + 20 = 50 ETH after the partial era-2 bury). `variableDebtWETH.balanceOf(adapterA) == 0` after each.

Expect `EraCompleted` on the two filling buries (era 0 and era 1). After the 20 ETH era-2 partial, `currentEra == 2` and reward rate has halved twice. Do not `vm.store` era fields.

A harvest attempt **before** the Aave warp/poke must revert (`NoHarvestableYield` or `ZeroHarvest`). Donation surplus was already harvested in beat 3.

### Beat 6 — harvest live Aave yield

Follow §3.6. `bob` or anyone may call `harvest()`. This credit is a second `totalHarvestedETH` increase; `totalDonatedETH` still unchanged by this call.

### Beat 7 — Aave-funded Reaper auction, mid-auction Reaper donation, sticky era

Follow §3.7 with **bob** as seller (alice may have sold her era-0 NETH in beat 3). `bob.startAuction()` budget is the Aave harvest (plus dust). Assert start rate `2.00 *` the **current** (era-2) Grave `R`.

Warp to midpoint; `currentReaperRate` is seller-favorable vs start.

**Reaper donation (§3.10):** `donor` sends ETH to Reaper while the auction is active. Auction `ethRemaining` unchanged; `availableReaperETH` and `totalDonatedETH` up; `totalHarvestedETH` unchanged.

**Era change during auction (§3.9 sticky R):** bury the remaining 20 ETH of era 2. `EraCompleted(2, …)`, `currentEra == 3`, Grave rate halved. `activeAuction.snapshottedRewardRate` still the era-2 `R`; `currentReaperRate` still uses that snapshot.

Bob `sellToReaper` a **partial** fill. Warp to end (7 days from start). `finalizeAuction()`. Unspent auction ETH rolls to `availableReaperETH` (which already holds the mid-auction donation). `neth.balanceOf(reaper) == 0`.

`bob.startAuction()` again: budget is rollover + Reaper donation. Assert that budget ≥ the donated amount and that `totalDonatedETH` did not increase on this start. Partial or empty fill is enough; warp 7 days and finalize so no auction is left active for migration.

### Beat 8 — ownership handoff

Follow §3.8 steps 1–3.

### Beat 9 — migrate Aave → Aave under the successor

Deploy `adapterB = new AaveV3WethAdapter(grave, provider, weth, aWeth)`. Successor schedules, warps 14 days, executes.

Assert:

- `activeStrategy == adapterB`
- `aWeth.balanceOf(adapterA) ≈ 0`
- `aWeth.balanceOf(adapterB) ≈ nav` taken from adapterA immediately before execute (balance-delta, not a mocked return)
- Grave idle ~0
- successor and admin ETH unchanged (no principal to owner)
- `variableDebtWETH.balanceOf(adapterA) == 0` and same for adapterB
- `protectedPrincipal` unchanged by migration
- `neth.totalSupply()` unchanged by migration (burns only happened in auction sells)

Optional extra: successor schedules adapterA again, warps, migrates back. Not required if beat 9 already proved Aave-to-Aave.

### Beat 10 — Grave donation while adapter is live, then bury deploys idle

Follow §3.10 Grave item 3: `donor` sends ETH to Grave. No mint, principal unchanged, idle on Grave, aWETH on adapterB unchanged. Next `bob.bury` deploys idle + new bury into adapterB; aWETH up by that sum; principal up by the bury only.

Then:

- `harvest` still cannot pull principal (if no new yield, expect revert; do not donate extra to force a harvest)
- Reaper has no `owner` / `pause` / `withdraw` of principal (selector-absent or revert-with-empty as in W5 `_assertSelectorAbsent`)
- NETH has no owner; Grave has no `pause`

## 5. What this suite must not do

- no production Solidity edits
- no mock strategy, mock Pool, or mock WETH in this file
- no storage writes, bytecode replace, or mocked external calls
- no skip-if-no-yield
- no Reaper/Grave donation as a substitute for Aave harvest (donations are required, separate beats)
- no `deal` onto Grave/Reaper in place of `receive()` donations
- no `renounceOwnership`
- no second simultaneous `activeStrategy`
- no calling Aave `borrow` **from the adapter** (whale-only, test helper)
- no adding `borrow` to src interfaces
- no pinning Sepolia; this is Base mainnet state
- no new GitHub workflow; existing `fork` job already runs `test/fork/**`

## 6. Tree

```
contracts/
├── foundry.toml                         unchanged (default excludes test/fork/**)
├── src/                                 unchanged
└── test/
    └── fork/
        ├── AaveV3WethAdapter.t.sol      unchanged (W5)
        └── ProtocolE2E.t.sol            new
```

## 7. CI and config

No `foundry.toml` or workflow change unless the new test cannot run under the existing job:

```text
forge test --match-path 'test/fork/**' --fork-url "$BASE_RPC_URL" -vvv
```

If the lifecycle exceeds the default Foundry timeout, set a per-test `vm.pauseGasMetering` only if gas metering (not execution) is the problem; prefer raising nothing until it actually fails. Do not lower fuzz runs in the default profile.

Document the extra file in `contracts/README.md` in one sentence: family e2e lives in `test/fork/ProtocolE2E.t.sol`, still behind `BASE_RPC_URL`.

## 8. Implementation steps

Do not run these until this NIP is explicitly started.

1. Add `contracts/test/fork/ProtocolE2E.t.sol` as in §3–§4.
2. One-line README pointer in `contracts/README.md`.
3. Do not modify `src/**`, W5 fork tests, CI YAML, or compiler pins.
4. From `contracts/`: `forge fmt`, `forge build`, `forge test` (default profile, no RPC).
5. With `BASE_RPC_URL`: `forge test --match-path test/fork/ProtocolE2E.t.sol --fork-url "$BASE_RPC_URL" -vvv`. W5 fork file must still pass.

## 9. Acceptance criteria

This slice is done when:

- `test/fork/ProtocolE2E.t.sol` exists and default `forge test` still ignores it
- the primary test deploys NETH, Grave, Reaper, and `AaveV3WethAdapter` and wires `setGrave` / `setReaper` in the test body
- ETH is buried before and after a strategy; NETH mints only via Grave
- era 0 is filled explicitly, then era 1, with a partial era 2; `EraCompleted` and a halved reward rate at each boundary; an era completion during an active auction does not change snapshotted Reaper `R`
- a Grave donation does not mint or raise `protectedPrincipal`; idle surplus harvest credits `totalHarvestedETH`; a later adapter-live donation stays idle until the next `bury` deploys it
- a direct Reaper donation credits `totalDonatedETH`, not harvest, and does not enlarge the in-flight auction budget
- first migration moves idle Grave ETH into live aWETH via canonical WETH9
- harvest sends **Aave-accrued** surplus ETH to Reaper without changing `protectedPrincipal`
- a Reaper auction starts from that Aave harvest, partially fills, burns NETH, and finalizes with rollover accounting; a follow-on auction can spend the mid-auction donation
- `Ownable2Step` handoff happens; the successor (not the deployer) executes Aave-to-Aave migration
- no `TestInvestAdapter`, no storage cheats, no skip-on-zero-yield
- W5 `AaveV3WethAdapter.t.sol` is unchanged and still passes on fork
- `src/**` is unchanged
- `forge fmt --check`, `forge build`, and default `forge test` pass from `contracts/`
- NDR-0002 remains Proposed unless accepted separately

## 10. Not decided here

Leave these to later NIPs / NDRs:

- pinned block for §22 “Base fork-test results” artifact freeze (W6 / audit pack)
- Base Sepolia fork (W6; different Aave market)
- deploy-script dry run against the same fork (W6)
- economic simulation (still M0, not this file)
- accepting NDR-0002
- keeper driving harvest / `startAuction` / `finalizeAuction` (W8)
- NDR-0005 `owner → address(0)` after a safer adapter

WETH wrap-locally, supply-only, aToken NAV, and Base V3 pins remain [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md). Pool is `provider.getPool()` at use ([`NDR-0007`](../ndr/0007-aave-pool-via-provider.md)). Harvest, 14-day delay, and `Ownable2Step` remain [`NIP-0006`](0006-strategy.md). Adapter behavior remains [`NIP-0007`](0007-aave-adapter.md). Era capacity/rate remain spec §5 / [`NIP-0004`](0004-grave.md). Donation vs harvest accounting remains spec §16.2 / [`NIP-0005`](0005-reaper.md) §4.2. Pause stays off Grave/Reaper ([`NDR-0005`](../ndr/0005-strategy-security.md)).
