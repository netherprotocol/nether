# NIP-0007: Aave V3 WETH adapter

- Status: Implemented
- Date: 2026-08-14
- Workstream: W5
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Venue: Accepted [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md)
- Pool lookup: Accepted [`NDR-0007`](../ndr/0007-aave-pool-via-provider.md)
- Strategy admin: Accepted [`NDR-0005`](../ndr/0005-strategy-security.md)
- Working versions: Proposed [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md) (not accepted)
- License: [`NDR-0004`](../ndr/0004-source-available-until-mainnet.md) (`SPDX-License-Identifier: UNLICENSED`)

This plan is the W5 breakdown. It implements the production `IStrategyAdapter` chosen in [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md): Aave V3 Core on Base, supply-only canonical WETH. Pool is `provider.getPool()` at use ([`NDR-0007`](../ndr/0007-aave-pool-via-provider.md)), not an immutable. It does not change NETH, Grave, Reaper, or the adapter interface. It does not deploy (W6).

## 1. Purpose

Give Grave a live ETH-denominated yield venue so harvest can send surplus to Reaper. The adapter is the replaceable piece (spec §6.4 / §21). W4 already talks to `IStrategyAdapter` and ships a test-only mock. W5 fills `contracts/src/strategy/` and adds Base fork tests (spec §17) plus the strategy risk analysis (spec §22 item 7).

M0’s non-fork suites must keep passing without an RPC. Fork tests are additional. M2 cannot ship without this adapter.

Do not build the later safer meta-adapter ([`NDR-0005`](../ndr/0005-strategy-security.md)). Do not add owner, pause, or token rescue.

## 2. Scope

In scope:

- `AaveV3WethAdapter` under `contracts/src/strategy/` implementing `IStrategyAdapter` **exactly** as spec §6.4
- Tiny local interfaces for WETH9, Aave V3 Pool, PoolAddressesProvider, and aToken (no Aave core submodule)
- Wrap locally, `provider.getPool()` then `supply` WETH, disable collateral, NAV = aWETH `balanceOf`, withdraw / unwrap to ETH
- Constructor stores Grave, provider, WETH, aWETH; no Pool immutable ([`NDR-0007`](../ndr/0007-aave-pool-via-provider.md))
- Unit tests with mocks (no RPC)
- Base fork tests: canonical WETH, this adapter, harvest realization, migration, aToken decimals/index ([spec §17](../protocol_spec.md))
- Strategy-specific risk analysis in §11 (spec §22 item 7)
- Default `forge test` excludes `test/fork/**`; CI fork job when `BASE_RPC_URL` is set

Out of scope:

- Changing `IStrategyAdapter`, Grave, Reaper, NETH, or `EraMath`
- Wrapped Token Gateway, borrow, flash loan, eMode, incentive claims, DEX
- wstETH, Morpho, Compound, Spark, Aave V4, NDR-0005 proxy
- Deploy scripts, CREATE2, cost abort, explorer verification (W6)
- Accepting NDR-0002
- Adapter owner / pause / ERC-20 rescue
- Uniting W4 and W5 ([`NIP-0000`](0000-the-roadmap.md) §2)

## 3. Architecture choices

These shapes are authorized for W5. They do not change era math, harvest, or the 14-day delay. Spec, [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md), and [`NDR-0007`](../ndr/0007-aave-pool-via-provider.md) win if anything below disagrees.

### 3.1 One adapter contract, local interfaces

| Shape | Why not |
|---|---|
| `forge install` aave-v3-core / address-book | Extra Solidity tree, pragma fights, [`NIP-0001`](0001-scaffolding.md) forbids extra contract libraries. Addresses are already in NDR-0006. |
| Call Wrapped Token Gateway | Gateway also has `borrowETH`; would need an aToken allowance to a third party. NDR-0006 forbids it. |
| Merge into Grave | Forbids replacement (spec §6.4). |
| `AaveV3WethAdapter` + 4 tiny interfaces (chosen) | One production deploy, no extra helpers, Pool/WETH/aToken typed without vendoring Aave. |

Files:

```text
contracts/src/strategy/AaveV3WethAdapter.sol
contracts/src/interfaces/IWETH9.sol
contracts/src/interfaces/IAaveV3Pool.sol
contracts/src/interfaces/IPoolAddressesProvider.sol
contracts/src/interfaces/IAToken.sol
```

Interfaces are **external** ABI slices, not Nether protocol surface. Do not add `IGrave.sol`.

### 3.2 No adapter admin

[`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md): no owner, pause, or rescue that can move WETH/aWETH. [`NDR-0005`](../ndr/0005-strategy-security.md): investing pause, if any, would live on the adapter; this venue uses Aave’s own reserve freeze instead.

| Shape | Why not |
|---|---|
| `Ownable` / `Pausable` on the adapter | Extra key; NDR-0006 forbids it. |
| `rescueToken` / `sweep` | Can steal WETH/aWETH. |
| Role-less adapter (chosen) | Only Grave can `depositETH` / `withdrawETH`. Constructor immutables: Grave, provider, WETH, aWETH. |

### 3.3 Pool from provider, not storage

[`NDR-0007`](../ndr/0007-aave-pool-via-provider.md): do not store Pool. On `depositETH` / `withdrawETH`, `pool = provider.getPool()`, then require `pool == aWeth.POOL()` (and non-zero). Approve and `supply`/`withdraw` that `pool`. Constructor checks the same match once.

Aave `setPoolImpl` keeps `getPool()` stable. If governance registers a **new** proxy, the adapter reverts until a 14-day Grave migration to an adapter built with the new aToken.

### 3.4 Approve exact WETH each deposit

NDR-0006 call flow: `WETH.approve(Pool, amount)` then `supply`. After `supply`, allowance is consumed.

Do not `approve(type(uint256).max)` in the constructor. Do not approve aTokens to anyone.

### 3.5 Always disable collateral after supply

Aave V3 `setUserUseReserveAsCollateral` **returns without reverting** if the flag already matches (SupplyLogic: `if (useAsCollateral == userConfig.isUsingAsCollateral(reserve.id)) return`). First WETH `supply` typically enables collateral (WETH LTV ≠ 0). After every successful `supply`, call `setUserUseReserveAsCollateral(weth, false)`. No bitmap decode, no try/catch.

### 3.6 Fork tests off the default profile

Default CI is `forge test -vvv` with no RPC ([`NIP-0001`](0001-scaffolding.md)). Fork tests need `BASE_RPC_URL`.

```toml
[profile.default]
no_match_path = "test/fork/**"

[profile.fork]
match_path = "test/fork/**"
```

Add a `fork` job in `.github/workflows/contracts.yml` that runs only when `secrets.BASE_RPC_URL` is non-empty:

```text
forge test --match-path 'test/fork/**' --fork-url "$BASE_RPC_URL" -vvv
```

Do not fail the default `check` job when the secret is absent. Do not add a second workflow file (NIP-0006). Do not commit RPC URLs.

### 3.7 Mocks for unit tests, live Aave for fork tests

Unit/fuzz: `test/mocks/MockWETH9.sol`, `test/mocks/MockAaveV3Pool.sol`, and `test/mocks/MockPoolAddressesProvider.sol` so W5 does not make `forge test` depend on Aave. Fork: real Base WETH + Pool + aBasWETH.

Keep `TestInvestAdapter` for existing W4 suites. Do not delete it. Do not put mocks under `src/`.

## 4. External interfaces

Minimal methods only. Do not copy Aave `ReserveData` structs (layout changes across V3.x).

```solidity
// IWETH9 — canonical Base WETH9
function deposit() external payable;
function withdraw(uint256 wad) external;
function approve(address guy, uint256 wad) external returns (bool);
function transfer(address dst, uint256 wad) external returns (bool);
function balanceOf(address) external view returns (uint256);

// IPoolAddressesProvider
function getPool() external view returns (address);

// IAaveV3Pool
function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
function withdraw(address asset, uint256 amount, address to) external returns (uint256);
function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external;

// IAToken
function balanceOf(address) external view returns (uint256);
function POOL() external view returns (address);
function UNDERLYING_ASSET_ADDRESS() external view returns (address);
```

`IAaveV3Pool.withdraw` `to` is the adapter, never Grave (Grave expects ETH). Referral code is always `0`.

## 5. Adapter

File: `contracts/src/strategy/AaveV3WethAdapter.sol`. `pragma solidity 0.8.36;`. SPDX `UNLICENSED`. Inherit `IStrategyAdapter` and OpenZeppelin `ReentrancyGuard`. Do not inherit `Ownable` or `Pausable`.

```text
constructor(address grave_, address provider_, address weth_, address aWeth_)
    // reject zero / EOAs (extcodesize == 0) for all four
    // pool = IPoolAddressesProvider(provider_).getPool(); reject zero
    // require IAToken(aWeth_).POOL() == pool
    // require IAToken(aWeth_).UNDERLYING_ASSET_ADDRESS() == weth_
    // store grave, provider, weth, aWeth as immutables
    // do not store pool

depositETH() payable nonReentrant          // only grave; wrap; pool=getPool(); approve; supply; disable collateral
withdrawETH(amount, recipient) nonReentrant // only grave; recipient == grave; pool=getPool(); withdraw; unwrap; send
totalAssetsInETH() view                    // aWeth.balanceOf(address(this))
underlying() view                          // weth
receive() payable                          // only weth (WETH9 withdraw)
```

`_pool()` helper: `p = provider.getPool(); require p != 0 && p == aWeth.POOL(); return p`.

Working mainnet pins (re-check at W6; spec §24). **Pool is `provider.getPool()`, not adapter storage.** The Pool row is the expected return value at W6:

| Role | Address |
|---|---|
| Canonical WETH | `0x4200000000000000000000000000000000000006` |
| PoolAddressesProvider | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` |
| Pool (expected `getPool()`) | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| aBasWETH | `0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7` |
| variableDebtWETH (tests only) | `0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E` |

Constructor takes Grave, provider, WETH, aWETH. Tests pass the NDR-0006/0007 pins. Do not hardcode Pool inside the adapter. A provider whose `getPool()` is not `aWeth.POOL()` must fail the constructor, not silently supply the wrong market.

Custom errors (suggested names):

```text
ZeroAddress()
NotContract()
NotGrave()
NotWeth()
InvalidPool()
InvalidAToken()
ZeroDeposit()
InvalidRecipient()
```

### 5.1 `depositETH`

```text
require msg.sender == grave
require msg.value > 0
pool = _pool()
WETH.deposit{value: msg.value}()
WETH.approve(pool, msg.value)
pool.supply(weth, msg.value, address(this), 0)
pool.setUserUseReserveAsCollateral(weth, false)
```

Checks-effects-interactions: no adapter storage writes after the first external call (immutables only). `ReentrancyGuard` covers WETH/Aave callbacks.

If `supply` reverts (pause, supply cap, frozen reserve), the whole call reverts and the wrap undoes. Grave already try/catches `depositETH`, emits `StrategyDepositFailed`, and leaves ETH idle ([`NIP-0006`](0006-strategy.md) §6.2, [`NDR-0009`](../ndr/0009-strategy-deposit-failed-event.md)).

Do not keep leftover WETH: `supply` the full wrapped amount.

### 5.2 `withdrawETH`

Grave harvest and migration pass `recipient = address(this)` (Grave) ([`NIP-0006`](0006-strategy.md) §4). Require `recipient == grave` as well as `msg.sender == grave`.

```text
require msg.sender == grave
require recipient == grave
assets = aWeth.balanceOf(address(this))
toWithdraw = amount < assets ? amount : assets
if toWithdraw == 0: return 0
pool = _pool()
if toWithdraw == assets: request = type(uint256).max   // avoid aToken dust
else: request = toWithdraw
wethBefore = WETH.balanceOf(address(this))
receivedWeth = pool.withdraw(weth, request, address(this))
// prefer balance delta if it differs from the return value (spec §16.3 spirit)
delta = WETH.balanceOf(address(this)) - wethBefore
unwrap = delta < receivedWeth ? delta : receivedWeth   // they should match
WETH.withdraw(unwrap)
Address.sendValue(payable(recipient), unwrap)
return unwrap
```

Cap by realizable aToken balance. If Aave liquidity is insufficient, `withdraw` reverts: harvest reverts (no try/catch on Grave harvest); migration continues best-effort ([`NIP-0006`](0006-strategy.md) §8.3).

Do not unwrap more than received. Do not send to `owner()` — there is none.

### 5.3 Views

`totalAssetsInETH()` is **only** `aWeth.balanceOf(address(this))` ([`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md)). Do not add idle ETH/WETH on the adapter into NAV. `receive()` rejects non-WETH senders so stray ETH cannot arrive except via `selfdestruct`. Transient ETH during unwrap lives only inside `withdrawETH`.

`underlying()` returns the WETH immutable, not `address(0)` (that is the test mock).

### 5.4 What the bytecode must not contain

No `borrow`, `borrowETH`, `flashLoan`, `repay`, `setUserEMode`, `approveDelegation`, incentive `claim`, gateway calls, DEX routers, or `transfer` of aWETH except as burned by `Pool.withdraw`.

## 6. Grave / harvest (unchanged)

W4 already:

- deposits idle ETH after `bury()` with try/catch
- harvests only realized ETH above `protectedPrincipal`
- migrates through Grave into the new adapter

W5 does not edit `Grave.sol`. Fork tests drive those paths with this adapter as `activeStrategy`.

## 7. What W5 must not do

- no change to `IStrategyAdapter.sol`, `Grave.sol`, `Reaper.sol`, `NETH.sol`, `EraMath.sol`
- no Aave core / address-book submodule
- no Wrapped Token Gateway
- no leverage, eMode, flash loan, incentive claim, DEX
- no adapter owner, pause, or rescue
- no second simultaneous Grave adapter
- no deploy scripts (W6)
- no accepting NDR-0002
- no NDR-0005 meta-adapter internals

## 8. Tree

```
contracts/
├── foundry.toml                         add default no_match_path + profile.fork
├── src/
│   ├── NETH.sol                         unchanged
│   ├── Grave.sol                        unchanged
│   ├── Reaper.sol                       unchanged
│   ├── interfaces/
│   │   ├── IStrategyAdapter.sol         unchanged
│   │   ├── IWETH9.sol                   new
│   │   ├── IAaveV3Pool.sol              new
│   │   ├── IPoolAddressesProvider.sol   new
│   │   └── IAToken.sol                  new
│   ├── libraries/
│   │   └── EraMath.sol                  unchanged
│   └── strategy/
│       └── AaveV3WethAdapter.sol        new
└── test/
    ├── unit/
    │   └── AaveV3WethAdapter.t.sol      mocks
    ├── fuzz/
    │   └── AaveV3WethAdapter.t.sol
    ├── fork/
    │   └── AaveV3WethAdapter.t.sol      Base
    └── mocks/
        ├── TestInvestAdapter.sol        unchanged
        ├── MockWETH9.sol                new
        ├── MockAaveV3Pool.sol           new
        └── MockPoolAddressesProvider.sol new
```

Existing W4 unit/fuzz/invariant suites stay green without this adapter.

## 9. Tests

### 9.1 Unit (`test/unit/AaveV3WethAdapter.t.sol`)

Mocks: WETH9 that mints 1:1 on `deposit` and burns on `withdraw`; Pool that pulls WETH, mints mock aTokens 1:1, accrues via `simulateInterest`, optionally reverts on `supply`/`withdraw`, tracks collateral flag, never opens debt; Provider whose `getPool()` the test can retarget.

Constructor:

- zero / EOA / `getPool() == 0` / `getPool() != aToken.POOL()` / aToken underlying mismatch revert
- immutables are grave, provider, weth, aWeth; no `pool()` storage; `underlying() == weth`

Access:

- non-Grave `depositETH` / `withdrawETH` revert
- `withdrawETH` to a recipient other than Grave reverts
- `receive()` from non-WETH reverts

Deposit:

- wraps all `msg.value`; adapter ETH balance 0; aToken balance == deposited
- Pool saw `supply(weth, amount, adapter, 0)`
- collateral disabled after deposit
- `msg.value == 0` reverts
- reverting `supply` reverts `depositETH` (and wrap undoes)

Withdraw:

- returns ETH to Grave; aToken decreases; Grave ETH delta equals return value
- request above aToken balance withdraws all
- full withdraw uses `type(uint256).max` against the mock (assert the request, or assert zero aToken dust)
- `amount == 0` or zero aToken returns 0 without Pool call
- reverting Pool `withdraw` reverts the adapter call
- after a successful deposit, retargeting the mock provider so `getPool() != aToken.POOL()` makes further `depositETH` / `withdrawETH` revert (`InvalidPool`)

NAV:

- `totalAssetsInETH() == aToken.balanceOf(adapter)`
- mock interest increases NAV with no ETH transfer
- after full withdraw, NAV is 0

Absence:

- no `owner`, `pause`, `borrow`, `rescue`
- mock variable-debt balance stays 0

Grave integration (unit, still mocked Pool):

- `scheduleStrategy` + `executeStrategyMigration` from `address(0)` (no 14-day wait; [`NDR-0008`](../ndr/0008-initial-strategy-immediate.md))
- `bury` deposits into the adapter; `currentNAV` includes aToken NAV
- mock interest then `harvest` sends only surplus ETH to Reaper; `protectedPrincipal` unchanged
- mock `supply` revert: `bury` still mints; ETH idle on Grave
- loss (mock burns aTokens): `harvestableYield == 0` until recovery

### 9.2 Fuzz

```text
deposit then withdraw(amount) returns min(amount, nav) ETH to Grave
sum(withdrawn) + remaining aToken NAV == cumulative deposited + simulated interest
collateral remains disabled
variable-debt token balance is always 0
only grave can deposit/withdraw
recipient other than grave always reverts
deposit/withdraw revert when mock provider.getPool() != aToken.POOL()
```

### 9.3 Fork (`test/fork/AaveV3WethAdapter.t.sol`)

`vm.createSelectFork("base")` (or `--fork-url`). Deal ETH to a test Grave admin and burier. Deploy NETH, Grave, Reaper, adapter with constructor `(grave, provider, weth, aWeth)` using the NDR-0006/0007 pins. `setReaper`, schedule, execute (first adapter has no 14-day wait).

Fork also asserts `provider.getPool() == aWeth.POOL() == 0xA238Dd80…d1c5` at the chosen block.

Spec §17:

| Check | Assert |
|---|---|
| Canonical WETH | `weth == 0x4200…0006`; wrap/unwrap 1:1 |
| Adapter | constructor pins pass; `underlying() == weth`; `IAToken(aWeth).UNDERLYING_ASSET_ADDRESS() == weth` |
| Deposit | `bury` leaves Grave idle ~0; `aWeth.balanceOf(adapter) ≈ buried` (wei rounding) |
| Collateral | after deposit, `variableDebtWETH.balanceOf(adapter) == 0`; a second `setUserUseReserveAsCollateral(weth, false)` is a no-op |
| Harvest | warp ≥ 7 days, poke the reserve (tiny WETH `supply` from a whale so the liquidity index updates), `totalAssetsInETH >= deposited`; if surplus > 0, `harvest` pays Reaper and leaves `currentNAV >= protectedPrincipal` |
| Migration | execute to `TestInvestAdapter`; ETH arrives on the mock, not the admin; reverse migrate back onto Aave |
| Decimals / rate | aWETH and WETH are 18 decimals; NAV is not an oracle price |

Also:

- Aave `supply` revert path: mock is enough in unit tests; on fork, if a pause/cap cannot be induced, skip rather than invent a cheat that desyncs aToken accounting
- `withdrawETH` recipient is Grave; admin ETH unchanged
- no `borrow` selector used; `variableDebtWETH.balanceOf(adapter) == 0` after deposit/withdraw/harvest/migration

### 9.4 Invariants

Do **not** put live Aave into `test/invariant/Strategy.t.sol`. That handler stays on `TestInvestAdapter`. Optional extra invariant file against the mocks (deposit/withdraw/interest, NAV vs aToken, no debt) is allowed; not required if unit+fuzz cover it.

## 10. CI and config

1. `foundry.toml`: `no_match_path = "test/fork/**"` on default; `[profile.fork]` with `match_path = "test/fork/**"`.
2. `.github/workflows/contracts.yml`: keep the existing `check` job. Add a `fork` job with `secrets.BASE_RPC_URL`, `if: ${{ secrets.BASE_RPC_URL != '' }}`, `working-directory: contracts`, same Foundry pin (`v1.7.1`), `forge test --match-path 'test/fork/**' --fork-url "$BASE_RPC_URL" -vvv`.
3. Document `BASE_RPC_URL` in `contracts/.env.example` if one exists, otherwise in `contracts/README.md`. No credentials.

Do not bump solc, OZ, or Foundry (NDR-0002 still Proposed).

## 11. Strategy-specific risk analysis (spec §22 item 7)

This section is the W5 risk artifact for the Aave V3 WETH adapter. It does not change monetary rules. W6 still owes the deploy/rollback runbook.

**Venue.** Aave V3 Core on Base. Supply-only canonical WETH. NAV = aBasWETH `balanceOf` (liquidity index, not an oracle). Realization = `Pool.withdraw` → WETH9 `withdraw` → ETH to Grave.

**Trust boundary.** Spec §16.3: approving this adapter is the governance trust boundary. The adapter does not fabricate NAV; it reports Aave’s aToken balance. If Aave’s Pool or aToken is compromised, reported NAV and realizable ETH can diverge. Grave still pays harvest from **balance deltas**, not from the return value alone.

**Smart-contract risk.** Aave Pool is a proxy. Governance may upgrade implementation, freeze the WETH reserve, change caps, or list new collateral in the same pool. Nether pins the Pool **proxy** address. An Aave bug or upgrade can lock or haircut supplier funds. Nether cannot pause Aave.

**Liquidity / utilization.** Withdraw needs WETH cash in the reserve. High utilization reverts `withdraw` / harvest. Principal stays in aTokens (loss-recovery-first if NAV drops). Migration try/catches old `withdrawETH`. New deposits revert and sit idle on Grave.

**Supply cap / pause.** `depositETH` reverts; `bury()` still succeeds (idle ETH).

**Insolvency / bad debt.** Aave can socialize losses to suppliers. aToken `balanceOf` may fall or become unredeemable 1:1. That is a strategy loss (spec §6.3), not a NETH recapitalization.

**Leverage.** Disabled by construction: no borrow/flash-loan code; collateral flag cleared after supply; tests assert zero variable debt. A future Aave change cannot make this adapter borrow unless bytecode is replaced (14-day Grave migration).

**Wrapping.** WETH9 on `0x4200…0006` only. Gateway unused. Wrong WETH in the constructor fails `UNDERLYING_ASSET_ADDRESS`. Wrong market fails `getPool() == aToken.POOL()`.

**Pool lookup.** Provider is immutable; Pool is not. In-place `setPoolImpl` keeps `getPool()` stable. A new Pool proxy that no longer matches `aToken.POOL()` reverts deposits/withdrawals until a 14-day Grave migration ([`NDR-0007`](../ndr/0007-aave-pool-via-provider.md)).

**Oracles.** Adapter NAV does not read Aave’s ETH price feed. Disabling collateral avoids health-factor / oracle paths for this user. Aave still uses oracles for the rest of the pool (liquidation of *other* users), which can stress utilization.

**Incentives.** Aave reward tokens, if any, are left unclaimed and are not protocol yield. Do not add a DEX to sell them.

**Admin keys.** Adapter has none. Grave owner remains timelocked replacement only ([`NDR-0005`](../ndr/0005-strategy-security.md)). Aave ACL is outside Nether.

**What harvest does under failure.**

| Aave state | `depositETH` | `withdrawETH` / harvest |
|---|---|---|
| Healthy | supplies | realizes surplus ETH |
| Supply cap / paused deposit | reverts; ETH idle on Grave | withdraw may still work |
| Frozen / paused withdraw | n/a | reverts; harvest reverts; NAV may still show aTokens |
| Utilization maxed | may still supply | withdraw/harvest revert |
| Insolvency | n/a | withdraw pays less or reverts; harvest limited to realized ETH |

## 12. Implementation steps

Do not run these until this NIP is explicitly started.

1. Add the four tiny interfaces in §4.
2. Add `AaveV3WethAdapter.sol` as in §5. `pragma solidity 0.8.36;`. SPDX `UNLICENSED`.
3. Add `MockWETH9`, `MockAaveV3Pool`, and `MockPoolAddressesProvider`.
4. Add unit and fuzz tests in §9.1–§9.2.
5. Add `test/fork/AaveV3WethAdapter.t.sol` as in §9.3.
6. Update `foundry.toml` and `contracts.yml` as in §10. Do not change compiler pins.
7. Do not modify `Grave.sol`, `Reaper.sol`, `NETH.sol`, `EraMath.sol`, or `IStrategyAdapter.sol`.
8. From `contracts/`: `forge fmt`, `forge build`, `forge test`. Run fork tests only with `BASE_RPC_URL`.

## 13. Acceptance criteria

W5 is done when:

- `AaveV3WethAdapter` lives under `src/strategy/` and implements spec §6.4 without interface changes
- Constructor checks `provider.getPool() == aToken.POOL()` and aToken underlying; Pool is not stored
- `depositETH` / `withdrawETH` call `provider.getPool()` and revert if it is not `aToken.POOL()`
- `depositETH` wraps, supplies, disables collateral; `withdrawETH` unwraps to Grave only
- `totalAssetsInETH()` is aWETH `balanceOf`; `underlying()` is canonical WETH
- no owner, pause, gateway, borrow, incentives, or rescue
- unit + fuzz pass without RPC; existing W4 suites still pass
- Base fork tests cover spec §17 (WETH, adapter, harvest, migration, decimals/index) when `BASE_RPC_URL` is set
- §11 is the recorded strategy risk analysis
- NDR-0002 remains Proposed unless accepted separately
- `forge fmt --check`, `forge build`, and `forge test` pass from `contracts/`

## 14. Not decided here

Leave these to later NIPs / NDRs:

- Base Sepolia Aave addresses (W6; may be a different market or mocked)
- CREATE2, cost script, explorer verification, mainnet pin re-verify (W6)
- which Safe receives Grave ownership (W6)
- accepting NDR-0002
- later wstETH / Morpho / Aave V4 adapters (M5)
- NDR-0005 safer meta-adapter internals and `owner → address(0)`
- keeper (W8)

Venue, wrap-locally, supply-only WETH, aToken NAV, no gateway/borrow/incentives/owner, and the Base V3 pins are [`NDR-0006`](../ndr/0006-aave-v3-weth-adapter.md). Pool is `provider.getPool()` at use ([`NDR-0007`](../ndr/0007-aave-pool-via-provider.md)). `IStrategyAdapter` is spec §6.4. Harvest and 14-day migration are [`NIP-0006`](0006-strategy.md). Pause stays off Grave/Reaper ([`NDR-0005`](../ndr/0005-strategy-security.md)).
