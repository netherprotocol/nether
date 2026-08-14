# NDR-0006: Initial production strategy adapter

- Status: Accepted
- Date: 2026-08-14
- Supersedes: (none)
- Superseded by: (none)

This record is **accepted**. W5’s first production venue is **Aave V3 on Base, supply-only canonical WETH**. It is not wstETH, not a vault wrapper, not Aave V4, and not the later safer meta-adapter in [`NDR-0005`](0005-strategy-security.md).

## Context

Spec §21 leaves the initial Grave strategy implementation-time configurable inside §6.4. Spec §22 requires a Base-specific justification. Spec §6.4 allows WETH, ERC-4626 shares, LSTs such as wstETH, or lending positions, and forbids leverage and directional non-ETH return. Spec §3 requires canonical Base WETH when wrapping is needed. Spec §20 forbids multiple simultaneous Grave adapters.

[`NIP-0000`](../nip/0000-the-roadmap.md) queued this NDR before W5 code: named deployment, pool, underlying, NAV source, realization path, leverage prohibition, failure modes. [`NDR-0005`](0005-strategy-security.md) already locked Grave admin and forbade building the safer proxy in W5. [`NIP-0006`](../nip/0006-strategy.md) shipped `IStrategyAdapter` and a test-only mock; this record chooses the mainnet venue behind that same interface.

Protected principal is irrecoverable by users. Yield must be realizable as ETH for harvest. The first adapter should be the smallest conservative ETH machine that is live and liquid on Base.

## Decision drivers

- Stay inside spec §6.4 / §16.3: ETH-denominated, no leverage, NAV from verifiable balances, harvest limited to realized ETH.
- Prefer a Base-native path: no bridging, no L1 staking queue, no DEX sell to realize ETH.
- Prefer 1:1 ETH accounting over an LST or share price.
- Prefer a large, long-audited venue over higher APY.
- Keep W5 inside the §18 launch budget: one adapter, no extra helpers, no reward-token swaps.
- Leave later diversification to M5 / a later adapter ([`NDR-0005`](0005-strategy-security.md)).
- Do not change `IStrategyAdapter`.

## Options

### Option A: Idle ETH (no production adapter)

Leave buried ETH on Grave. Simplest and safest locally. Reaper never receives yield. Spec §1 expects productive capital. Rejected for M2.

### Option B: Hold wstETH (Lido)

Spec §6.4 names wstETH as allowed. On Base, wstETH (`0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452`) is a **bridged** LST: it cannot be unwrapped to ETH on Base. Realizing ETH means a DEX sale (slippage, non-ETH inventory risk) or bridging back to L1 (not Base-local; withdrawal delay). NAV needs a wstETH/ETH rate, not a 1:1 token balance. Extra risks: Lido slashing, LST depeg vs ETH, bridge/canonical-token risk.

Higher staking-style yield is real. Realization and NAV are worse than supply-only WETH for a first adapter.

### Option C: Aave V3 Core on Base, supply-only WETH (chosen)

Supply canonical WETH into the existing Aave V3 Base pool. aWETH is a rebasing claim on WETH; `balanceOf` is already ETH-denominated. Withdraw WETH, unwrap, send ETH to Grave. No borrow, no eMode, no flash loan, no reward claims.

### Option D: wstETH in Aave (or any LST + lending stack)

Earn staking yield plus supply yield. Stacks Option B’s LST/bridge/depeg risk on Option C’s pool risk. NAV and realization are strictly harder. Rejected for W5.

### Option E: Morpho vaults, Compound III, Spark, Yearn / ERC-4626

Same economic idea as lending, with extra curator, vault, or isolated-market surface. Compound III on Base is USDC-centric (WETH is typically collateral, not the earning base). Morpho vault APY depends on a curator. None beat Aave V3 WETH on Base depth, integrator familiarity, and 1:1 aToken NAV for v1.

### Option F: AMM LP, restaking, looping

Aerodrome/Uniswap LP, weETH/EigenLayer-style restaking, or supply-and-borrow loops. Forbidden or out of spirit: IL and directional inventory, extra slashing, or leverage (spec §6.4 / §20).

### Option G: Aave V4

V4 is a new hub-and-spoke deployment, live first on Ethereum, still early TVL. W5 uses the battle-tested Base V3 pool. A later NDR may migrate if V4 on Base is the conservative venue.

## Decision

Chosen option: **Option C**.

W5 implements one `IStrategyAdapter` under `contracts/src/strategy/` that:

1. Wraps `msg.value` to canonical Base WETH and `supply`s it to Aave V3 **Pool**.
2. After each supply, `setUserUseReserveAsCollateral(WETH, false)` if it is enabled.
3. Reports `totalAssetsInETH() = aWETH.balanceOf(adapter)` (rebasing aToken; no oracle).
4. On `withdrawETH`, `Pool.withdraw` WETH, unwraps, sends ETH to `recipient` (Grave).
5. Returns `underlying() = canonical WETH`.
6. Rejects callers other than Grave on `depositETH` / `withdrawETH`.

**Do not** call `borrow`, `borrowETH`, `flashLoan`, `repay`, eMode, or the Wrapped Token Gateway. **Do not** `approveDelegation` on the variable-debt token. **Do not** approve aTokens to any third party. **Do not** claim Aave incentive tokens (non-ETH; no DEX to sell them). **Do not** add an adapter owner, pause, or ERC-20 rescue that can move WETH/aWETH.

Wrap locally instead of `WrappedTokenGateway.depositETH` so the adapter never grants the gateway (which also has `borrowETH`) an aToken allowance.

Working addresses (re-verify at W6 from [Aave address book](https://github.com/bgd-labs/aave-address-book) / spec §24; do not treat this table as deploy-time truth if they have moved):

| Role | Address |
|---|---|
| Canonical WETH | `0x4200000000000000000000000000000000000006` |
| PoolAddressesProvider | `0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D` |
| Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| aBasWETH | `0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7` |
| variableDebtWETH (must stay 0) | `0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E` |

Constructor immutables: Grave, Pool, WETH, aWETH. Resolve Pool from the provider at deploy and assert it matches. Referral code `0`.

Leverage prohibition: adapter bytecode has no borrow/flash-loan path; collateral is disabled; tests assert `variableDebtWETH.balanceOf(adapter) == 0` after every successful call.

- Option A produces no Reaper ETH.
- Option B is allowed by the spec but fails Base-local 1:1 realization.
- Option D/E add risk or curator surface without fixing Option C’s job.
- Option F is out of spec.
- Option G is a later venue candidate, not the first one.

## Integration

These are Aave V3 facts the adapter relies on. They do not change Option C.

**PoolAddressesProvider** is Aave’s registry for one market (here: V3 Core on Base). Its address is stable. `getPool()` returns the Pool **proxy**. Aave governance may upgrade the Pool implementation behind that proxy; it should not silently replace the proxy. At deploy, call `provider.getPool()` and revert if it is not the pinned Pool. Store Grave, Pool, WETH, and aWETH as immutables. Do not read the provider again at runtime.

**aWETH** is Aave’s rebasing receipt for supplied WETH: one aToken per reserve, 1:1 with the underlying at mint/burn, `balanceOf` includes accrued supply interest. **aBasWETH** is the Basescan / address-book name of that same token on Base (`a` + `Bas` + `WETH`). There is not a second token.

**Yield does not arrive as a transfer.** Borrowers pay interest into the WETH reserve; Aave raises that reserve’s liquidity index; `aWETH.balanceOf(adapter)` grows with no call and no ETH/WETH moving onto the adapter. Nether `harvest()` is what later turns the surplus into ETH for Reaper: Grave calls `withdrawETH`, the adapter burns aTokens via `Pool.withdraw`, unwraps WETH, and sends ETH to Grave.

**Wrapping** is WETH9 on canonical Base WETH (`0x4200…0006`). Aave’s Pool accepts only ERC-20, not native ETH. `WETH.deposit{value: n}()` credits `n` WETH 1:1; `WETH.withdraw(n)` burns `n` WETH and returns `n` ETH. The adapter wraps before `supply` and unwraps after `withdraw`. Do not use Aave’s Wrapped Token Gateway.

**`setUserUseReserveAsCollateral(asset, useAsCollateral)`** is a Pool call that marks `msg.sender`’s supply of `asset` as borrowable collateral (`true`) or not (`false`). A first WETH `supply` typically enables collateral automatically because WETH’s LTV is not zero. Collateral is how Aave borrowing starts; with it on, a later `borrow` (or credit delegation) could debt-finance against Grave ETH. After every supply, if collateral is enabled, call `setUserUseReserveAsCollateral(WETH, false)`. Supply yield still accrues. Tests: `variableDebtWETH.balanceOf(adapter) == 0` and collateral disabled.

Call flow:

```text
depositETH (Grave → adapter):
  WETH.deposit{value}()
  WETH.approve(Pool, amount)
  Pool.supply(WETH, amount, adapter, 0)
  Pool.setUserUseReserveAsCollateral(WETH, false)  // if enabled

time passes:
  aWETH.balanceOf(adapter) rises with the liquidity index

withdrawETH (Grave pulls surplus or migrates):
  Pool.withdraw(WETH, amount, adapter)   // burns aWETH, pays WETH
  WETH.withdraw(received)
  send ETH to recipient (Grave)
```

## Consequences

- W5 is this adapter plus Base fork tests (spec §17): wrap/unwrap, supply/withdraw, harvest realization, migration, supply-cap / paused-reserve / high-utilization failure. Spec §22 item 7 (strategy risk analysis) is written in W5, not here.
- `IStrategyAdapter` does not change. The W4 test mock stays under `contracts/test/`.
- If `depositETH` reverts (Aave pause, supply cap), Grave already leaves ETH idle ([`NDR-0005`](0005-strategy-security.md)). If withdraw is liquidity-constrained, harvest sends only realized ETH.
- Adapter-level pause is unused: Aave can freeze the reserve; Grave has no pause.
- W6 still transfers Grave owner to a multisig and does not renounce ([`NDR-0005`](0005-strategy-security.md)).
- M5 / later NDRs may add wstETH, Morpho, Aave V4, or the safer meta-adapter. This record does not freeze those forever; it freezes the **first** production venue.
- Incentives left unclaimed are not protocol yield.

Failure modes this venue accepts: Aave insolvency / socialized bad debt; utilization that delays withdraw; reserve freeze or supply cap; Aave governance changing Pool implementation or WETH params; wrap/unwrap bugs; aToken NAV lying only if Aave itself is compromised (spec §16.3 trust boundary is still “approve this adapter”).

What would trigger a superseding NDR: choosing wstETH or a vault as the first venue; using the gateway or enabling collateral/borrow; claiming and selling rewards; targeting Aave V4 or a different Base market; or folding the NDR-0005 meta-adapter into W5.
