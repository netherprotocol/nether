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

Prove the deployed-shape protocol works on current Base state: configure contracts the way §18.3 wires them, bury ETH for NETH, put Grave ETH into Aave via WETH9, harvest real supply yield into Reaper, run a reverse Dutch auction, migrate between two live Aave adapters, and hand off `Ownable2Step` ownership. Every beat uses public functions and real token/pool accounting. Fail the suite if Aave does not actually pay; do not skip and do not fake NAV.

W5 already covers adapter pins, wrap/unwrap, collateral-off, and a mock round-trip. This suite is the M0 integration gate those tests do not provide (Reaper auctions, ownership change, idle-then-deploy, Aave-to-Aave migration).

Default `forge test` stays RPC-free. This suite stays under `test/fork/**` and the existing `fork` CI job.

## 2. Scope

In scope:

- `contracts/test/fork/ProtocolE2E.t.sol` (one file)
- One primary sequential lifecycle test that starts from deploy and walks the full flow
- Helpers that only wrap public calls, time, and ETH for test actors
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
3. `makeAddr` for setter, deployer admin, successor admin, alice, bob, whale
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
- Calling live WETH9 / Aave Pool from a whale to update the liquidity index or, if needed, create WETH utilization (§6)

Forbidden:

- `vm.store` / `stdstore` on NETH, Grave, Reaper, adapters, WETH, Aave
- `vm.etch`, `vm.mockCall`, `vm.expectCall` as a substitute for an assert on balances
- `deal(aWeth, adapter, …)` or `deal(weth, adapter, …)`
- `TestInvestAdapter` scripted P/L
- `skip`, `vm.skip`, or `if (harvestable == 0) { /* no harvest */ }` as a passing branch
- Calling `adapter.depositETH` / `withdrawETH` as a test actor (only Grave may; the flow is `bury` / `harvest` / `executeStrategyMigration`)
- Donating ETH to Reaper or Grave **instead of** Aave harvest to fund the auction (donations remain allowed as extra beats, not as the harvest substitute)

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

Bury size: use **50 ETH** for the post-adapter bury so the same transaction crosses era 0 (capacity 10 ETH) and later eras — `EraCompleted` should fire without any storage poke. If a single 50 ETH bury is too heavy for RPC, 10 ETH is the floor (that completes era 0 exactly when idle principal is already 0). Prefer 50 ETH so harvest dust is less likely.

### 3.7 Reaper auction is funded by that harvest

Spec: any positive `availableReaperETH` may start an auction; no minimum budget. This suite still wants a **visible** fill:

1. `bob.startAuction()` (permissionless). Snapshot `R = grave.currentRewardRate()` at start; `currentReaperRate() == 2.00 * R` at elapsed 0.
2. Alice approves NETH and `sellToReaper` a **partial** fill (`minEthOut` from `quoteReaperSale`). Assert NETH burned (`totalSupply` down, alice balance down, `reaper.balanceOf(neth) == 0`), ETH paid to alice, `totalNethReaped` up, auction `ethRemaining` down.
3. Warp to auction end (7 days). `finalizeAuction()`. Unspent ETH rolls to `availableReaperETH`; auction inactive.
4. Optional: `startAuction` again on rollover if `availableReaperETH > 0`. Not required if leftover is 0.

Do not `vm.store` auction fields. Do not inject ETH on Reaper to start the first auction.

Warp inside an auction to a midpoint and assert the rate moved seller-favorable (`currentReaperRate` decreased toward `1.05 * R`) before the partial sell, or sell at t=0 and assert start rate. Midpoint is preferred so the curve is observed on-chain.

### 3.8 Ownership change is `Ownable2Step`, then the successor migrates

Spec §18.3 step 12: administrative authority leaves the deployer EOA. [`NIP-0006`](0006-strategy.md): `transferOwnership` / `acceptOwnership`; do not `renounceOwnership` (W6 must not).

Beat:

1. After harvest/auction, `admin.transferOwnership(successor)`; successor is still not owner.
2. `successor.acceptOwnership()`; `grave.owner() == successor`.
3. `admin.scheduleStrategy` reverts (`OwnableUnauthorizedAccount`).
4. Successor deploys adapter B, `scheduleStrategy(adapterB)`, warp 14 days, `executeStrategyMigration()`.

Successor, not deployer, is the only admin who may complete migration in this suite. That is the production-shaped handoff.

## 4. Lifecycle (primary test)

Name: `test_protocolLifecycleOnBaseFork`. File: `contracts/test/fork/ProtocolE2E.t.sol`. `pragma solidity 0.8.36`. SPDX `UNLICENSED`.

Actors: `setter`, `admin` (deployer owner), `successor`, `alice` (burier / NETH seller), `bob` (auction starter / extra burier), `whale` (Aave poke / optional borrow).

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

### Beat 2 — bury ETH before a strategy (idle on Grave)

`alice.bury{value: 1 ether}(0)` (or `quoteBury` as `minNethOut`).

Assert:

- `neth.balanceOf(alice) == nethOut == grave.quoteBury` at the pre-state (call `quoteBury` **before** the bury)
- `grave.protectedPrincipal() == 1 ether`
- `address(grave).balance == 1 ether` (idle; no adapter)
- `adapterA.totalAssetsInETH() == 0`
- `neth.mint` from alice reverts (`NotGrave`)

This is “burying ETH, minting NETH.” There is no `buryNeth`.

### Beat 3 — first adapter: schedule, delay, execute (idle ETH into Aave)

`admin.scheduleStrategy(adapterA)`. Assert `pendingStrategy` adapter and `executeAfter == block.timestamp + 14 days`.

`admin.executeStrategyMigration()` **before** warp reverts (`StrategyDelayNotElapsed`).

Warp 14 days. `admin.executeStrategyMigration()`.

Assert:

- `activeStrategy == adapterA`, pending cleared
- Grave idle ~0
- `aWeth.balanceOf(adapterA) ≈ 1 ether` (wei rounding, `assertApproxEqAbs(..., 2)` is enough)
- `grave.currentNAV()` ≈ `protectedPrincipal`
- `variableDebtWETH.balanceOf(adapterA) == 0`
- a second `setUserUseReserveAsCollateral(weth, false)` from the adapter as `prank` is a no-op (optional; do not fail the suite if the Pool treats it as a no-op)
- admin ETH unchanged

This is “depositing Grave into strategy” via migration from `address(0)`.

### Beat 4 — bury after adapter (deposit-on-bury)

`bob.bury{value: 50 ether}(minNethOut)` with `minNethOut = grave.quoteBury(50 ether)` immediately before the call.

Assert:

- Grave idle ~0
- aWETH on adapterA increased by ≈ 50 ETH
- `protectedPrincipal == 51 ether`
- `EraCompleted` fired (50 ETH + prior 1 ETH crosses era 0’s 10 ETH capacity; may complete more than one era). Check via `vm.expectEmit` on the known first completed era, or `currentEra > 0` plus `totalNethMinted` matching the split. Do not `vm.store` era fields.
- `variableDebtWETH.balanceOf(adapterA) == 0`

If `expectEmit` for every crossed era is brittle, asserting `currentEra >= 1` and `neth.totalSupply() == alice + bob` is enough, plus at least one `EraCompleted` log in the receipt.

### Beat 5 — harvest live yield

Follow §3.6. `bob` or anyone may call `harvest()`.

Also: a harvest attempt **before** warp/poke must revert (`NoHarvestableYield` or `ZeroHarvest`). Do that immediately after beat 4, before warping.

### Beat 6 — Reaper auction

Follow §3.7. Alice is the seller (she holds era-0-rich NETH). Bob starts. After finalize, `neth.balanceOf(reaper) == 0`.

### Beat 7 — ownership handoff

Follow §3.8 steps 1–3.

### Beat 8 — migrate Aave → Aave under the successor

Deploy `adapterB = new AaveV3WethAdapter(grave, provider, weth, aWeth)`. Successor schedules, warps 14 days, executes.

Assert:

- `activeStrategy == adapterB`
- `aWeth.balanceOf(adapterA) ≈ 0`
- `aWeth.balanceOf(adapterB) ≈ nav` taken from adapterA immediately before execute (balance-delta, not a mocked return)
- Grave idle ~0
- successor and admin ETH unchanged (no principal to owner)
- `variableDebtWETH.balanceOf(adapterA) == 0` and same for adapterB
- `protectedPrincipal` unchanged by migration
- `neth.totalSupply()` unchanged by migration (burns only happened in beat 6)

Optional extra: successor schedules adapterA again, warps, migrates back. Not required if beat 8 already proved Aave-to-Aave.

### Beat 9 — post-migration sanity

- `bob` or `alice` can `bury` again; ETH lands in adapterB aWETH
- `harvest` still cannot pull principal (if no new yield, expect revert; do not donate to force it)
- Reaper has no `owner` / `pause` / `withdraw` of principal (selector-absent or revert-with-empty as in W5 `_assertSelectorAbsent`)
- NETH has no owner; Grave has no `pause`

## 5. What this suite must not do

- no production Solidity edits
- no mock strategy, mock Pool, or mock WETH in this file
- no storage writes, bytecode replace, or mocked external calls
- no skip-if-no-yield
- no Reaper/Grave donation as the harvest path
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
- first migration moves idle Grave ETH into live aWETH via canonical WETH9
- harvest sends **Aave-accrued** surplus ETH to Reaper without changing `protectedPrincipal`
- a Reaper auction starts from that harvest, partially fills, burns NETH, and finalizes with rollover accounting
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

WETH wrap-locally, supply-only, aToken NAV, and Base V3 pins remain [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md). Pool is `provider.getPool()` at use ([`NDR-0007`](../ndr/0007-aave-pool-via-provider.md)). Harvest, 14-day delay, and `Ownable2Step` remain [`NIP-0006`](0006-strategy.md). Adapter behavior remains [`NIP-0007`](0007-aave-adapter.md). Pause stays off Grave/Reaper ([`NDR-0005`](../ndr/0005-strategy-security.md)).
