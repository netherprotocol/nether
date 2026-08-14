# NIP-0004: Grave — burial, eras, and reckoning

- Status: Implemented
- Date: 2026-08-14
- Workstream: W2
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Working versions: Proposed [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md) (not accepted)
- License: [`NDR-0004`](../ndr/0004-source-available-until-mainnet.md) (`SPDX-License-Identifier: UNLICENSED`)

This plan is the W2 breakdown. It implements spec §5–§6.1 and the burial-related views and events in §12–§13. It does not implement harvest, strategy adapters, Reaper, or pause.

## 1. Purpose

Ship a pure era-math library and an immutable `Grave` so anyone can irreversibly bury ETH and receive deterministic NETH. Reckoning is the era-change event `EraCompleted`, not a separate contract, not NAV, not harvest, and not Reaper settlement ([`NIP-0000`](0000-the-roadmap.md) §5).

Until W4, buried ETH stays as idle backing on Grave so W2 is testable without a strategy ([`NIP-0000`](0000-the-roadmap.md) §2, W2).

## 2. Scope

In scope:

- `EraMath` as a pure library: capacity, reward rate, maximum reachable era from constants, multi-era split, floor rounding that favors the protocol by at most one NETH wei per internal era segment
- `Grave.bury(uint256 minNethOut)`: irreversible capitalization, `protectedPrincipal` monotonicity, mint to `msg.sender`, era-boundary crossings in one transaction
- Reckoning: emit `EraCompleted` whenever an era fills, including mid-`bury()` crossings
- Burial-related §12 views that do not need a strategy or Reaper
- `receive()` that accepts unsolicited ETH without minting or increasing `protectedPrincipal` (spec §16.2 recommended surplus path)
- Unit, fuzz, and stateful invariant tests required by spec §17 for era math, burial, principal, and issuance

Out of scope:

- Strategy adapter calls, `harvest()`, timelock, `StrategyDeposit` / migration events (W4)
- Reaper, auctions, `totalNethReaped`, Reaper views (W3)
- Deploy scripts (W6), frontend (W7), keeper (W8)
- Accepting NDR-0002
- Proxies, upgradeability, Ownable/AccessControl on Grave (W4 strategy admin)
- Changing NETH’s mint lock ([`NIP-0003`](0003-neth.md) already shipped `setGrave`)
- Uniting NETH and Grave into one contract ([`NIP-0000`](0000-the-roadmap.md) §2)

Do not implement a `Reckoning` contract or a `withdraw` / `redeem` / `unstake` path.

## 3. Constants and era math

Spec §5.1 and §21 are the monetary rules. Do not change them.

```text
INITIAL_ERA_CAPACITY = 10 ether                 // 10e18 wei
INITIAL_REWARD_RATE  = 1_000_000 ether          // 1,000,000 NETH (18 decimals) per 1 ETH
CAPACITY_MULTIPLIER  = 2
REWARD_DIVISOR       = 2
```

For era `e` starting at `e = 0`:

```text
eraCapacity(e) = 10 ether * 2^e
rewardRate(e)  = 1_000_000 ether / 2^e          // truncating; NETH wei per ETH
```

A complete era’s exact product is `10_000_000 ether` NETH (§4.2, §5.1). Dust burials may undershoot that total because each segment floors; they must never overshoot.

### 3.1 Maximum reachable era

Spec §5.4: define the bound from constants, not as a discretionary supply cap. Further burial MUST revert once the reward rate would round to zero at token precision.

```text
maxEra = max { e ∈ ℕ₀ | INITIAL_REWARD_RATE / 2^e > 0 }
```

With `INITIAL_REWARD_RATE = 10^24`, that is `floor(log2(10^24)) = 79`. Tests may assert this derived value as a regression check. Do not introduce a named supply cap or a different cutoff.

`eraCapacity(e)` and `rewardRate(e)` revert if `e > maxEra`. A `bury()` that cannot place the entire `msg.value` into eras with a positive rate reverts in full (no partial keep of ETH, no zero-NETH mint).

Use OpenZeppelin 5.x `Math.log2` / `Math.mulDiv` (floor / toward zero). Do not add PRBMath, Solady, or Solmate ([`NIP-0001`](0001-scaffolding.md) §5).

### 3.2 Rounding

All arithmetic is 18-decimal integer (§5.4). For each internal era segment:

```text
nethSeg = floor(ethSeg * rewardRate(era) / 1 ether)
```

That is one `mulDiv` per segment. No stored fractional entitlement between burials. Loss vs the exact rational is at most one NETH wei per segment, in the protocol’s favor.

`minNethOut` is a slippage check in `bury()`, not part of the math library.

### 3.3 Multi-era split

A single `bury()` MAY cross one or more era boundaries and MUST NOT revert merely because it does (§5.3). Split `msg.value` internally; apply each era’s rate only to the ETH that belongs to that era.

Example from the spec (era 0 has 1 ETH remaining, user buries 3 ETH):

```text
1 ETH * 1,000,000 = 1,000,000 NETH
2 ETH *   500,000 = 1,000,000 NETH
Total                2,000,000 NETH
```

`quoteBury(ethAmount)` MUST use the same split path (§12).

## 4. Grave surface

File: `contracts/src/Grave.sol`. Inherit OpenZeppelin `ReentrancyGuard` ([`NIP-0001`](0001-scaffolding.md) §5). Do not add `Ownable`, `Pausable`, or a strategy slot in this slice.

```text
pragma solidity 0.8.36;

constructor(address neth_)                 // reject address(0) and EOAs (extcodesize == 0)

neth() → NETH                              // immutable
currentEra() → uint256                     // 0 at deploy
currentEraCapacity() → uint256
currentEraBuried() → uint256               // ETH in the incomplete current era; 0 at deploy
currentRewardRate() → uint256              // NETH wei per ETH; era 0 = 1_000_000 ether
quoteBury(uint256 ethAmount) → uint256
protectedPrincipal() → uint256             // 0 at deploy; cumulative successful bury msg.value
currentNAV() → uint256                     // address(this).balance (idle ETH only)
harvestableYield() → uint256               // max(0, currentNAV - protectedPrincipal)
activeStrategy() → address                 // address(0) until W4
totalNethMinted() → uint256                // gross burial issuance; not ERC-20 totalSupply

bury(uint256 minNethOut) payable → uint256 nethOut
receive() payable                          // donation / surplus; no mint, no principal
```

`quoteBury` does not take `minNethOut`. It reverts on the same invalid inputs as `bury` would (`ethAmount == 0`, output would be 0, ETH would not fit in eras with a positive rate).

Do not add Reaper views (`availableReaperETH`, `activeAuction`, `currentReaperRate`, `quoteReaperSale`, `totalNethReaped`). Those are W3.

### 4.1 Constructor and NETH lock

Spec §18.3: deploy NETH, deploy Grave, then finalize Grave-only mint. Grave’s constructor takes the already-deployed `NETH` address. Grave does **not** call `setGrave`; the NETH `graveSetter` does, as in [`NIP-0003`](0003-neth.md).

W2 tests: deploy `NETH(setter)`, deploy `Grave(neth)`, `neth.setGrave(grave)`, then bury.

No Reaper address in this constructor. W3/W4 may add Reaper wiring before any production deploy (W6). Do not add a standing `setNeth` or `setReaper` in W2.

### 4.2 `bury()`

```solidity
function bury(uint256 minNethOut) external payable nonReentrant returns (uint256 nethOut);
```

Requirements (spec §6.1, §2, §9):

1. `msg.value > 0`.
2. Split across eras; revert rather than mint zero NETH (smallest positive ETH that produces at least one NETH wei after rounding).
3. Revert if `nethOut < minNethOut` (same-block era transition protection, §5.3).
4. Increase `protectedPrincipal` by exactly `msg.value`. Never decrease it. Never refund ETH on success.
5. Mint `nethOut` to `msg.sender` via `neth.mint`. No `to` / bury-on-behalf parameter.
6. Leave the ETH on Grave (idle backing). Do not wrap to WETH, do not call `IStrategyAdapter`.
7. Emit `EraCompleted` for every era that fills in this transaction, then `Buried`.
8. Checks-effects-interactions: update era state, principal, and issuance counters before `mint`.

Burial is irreversible on success. There is no function that sends buried ETH to the burier, admin, or anyone else.

### 4.3 Reckoning (`EraCompleted`)

Emit whenever an era fills, including when one `bury()` fills several eras.

```text
EraCompleted(era, ethBuried, nethMinted)
```

Populate as era-level totals so indexers can reconstruct issuance by era without replaying every `Buried` split (§13, §19):

| Field | Value |
|---|---|
| `era` | the era that just filled |
| `ethBuried` | `eraCapacity(era)` (ETH buried in that era equals capacity) |
| `nethMinted` | actual NETH minted in that era across all burials that contributed, after per-segment floors (≤ `10_000_000 ether`) |

Keep `nethMintedThisEra` in storage so a completing segment can emit the era’s cumulative minted amount, not only the last slice. Reset it when the next era starts.

```text
Buried(user, ethAmount, nethMinted, endingEra)
```

`ethAmount` is `msg.value`; `nethMinted` is this transaction’s total; `endingEra` is `currentEra` after the split (the incomplete era, which may be the one just entered).

Do not emit `StrategyDeposit`, harvest, migration, pause, or Reaper events.

### 4.4 Idle ETH, NAV, donations

`currentNAV()` in W2 is `address(this).balance`. That equals `protectedPrincipal` plus unsolicited ETH. W4 will add `strategy.totalAssetsInETH()` to this formula; do not pretend a strategy exists.

`harvestableYield()` uses spec §6.2 with `alreadyReservedForReaper = 0` and no adapter:

```text
harvestable = max(0, currentNAV - protectedPrincipal)
```

The view is required by §12. Do not add `harvest()`; surplus stays idle until W4.

`receive()` accepts ETH. Forced ETH (`selfdestruct`) also increases the balance. Neither path mints NETH or increases `protectedPrincipal` (§16.2). Donations are surplus backing, not yield to spend in W2.

### 4.5 Custom errors and events

Use custom errors (spec §18.2). Suggested names, not a protocol requirement:

```text
ZeroAddress()
NotContract()
ZeroValue()
ZeroNethOut()
InsufficientNethOut(uint256 nethOut, uint256 minNethOut)
RewardRateZero(uint256 era)
```

```text
event Buried(address indexed user, uint256 ethAmount, uint256 nethMinted, uint256 endingEra);
event EraCompleted(uint256 indexed era, uint256 ethBuried, uint256 nethMinted);
```

## 5. What Grave must not do

Spec §2, §6.1, §10, §16.2, §20:

- no ETH redemption, withdrawal, or “unstake”
- no mint except through `neth.mint` from `bury()`’s deterministic amount
- no admin mint, era-parameter setter, or standing privilege
- no pause on burial in W2 (W4 does not pause Grave either; [`NDR-0005`](../ndr/0005-strategy-security.md))
- no NETH price oracle, DEX hook, or market-cap input
- no wrapping / strategy deposit / harvest / Reaper credit
- no proxy, UUPS, Beacon, or upgradeable OpenZeppelin modules
- no transfer of principal to an EOA for any reason

## 6. Tree

Follow [`NIP-0001`](0001-scaffolding.md). Keep `test/mocks/GraveStub.sol` for NETH tests; W2 tests use the real `Grave`.

```
contracts/
├── src/
│   ├── NETH.sol                         unchanged
│   ├── Grave.sol
│   └── libraries/
│       └── EraMath.sol
└── test/
    ├── unit/
    │   ├── NETH.t.sol                   unchanged
    │   ├── EraMath.t.sol
    │   └── Grave.t.sol
    ├── fuzz/
    │   ├── NETH.t.sol                   unchanged
    │   ├── EraMath.t.sol
    │   └── Grave.t.sol
    ├── invariant/
    │   └── Grave.t.sol
    └── mocks/
        └── GraveStub.sol                unchanged; not the W2 Grave
```

Do not add `src/interfaces/IGrave.sol` in this slice. An interface is a later §22 artifact if W6/docs need one. W7 can call `Grave` directly.

`EraMath` is an `internal` library used by `Grave`. It is not a deployed contract.

Suggested library helpers (reshape as needed; one split path for `quoteBury` and `bury`):

```text
maxEra() → uint256
eraCapacity(uint256 era) → uint256
rewardRate(uint256 era) → uint256
nethForSegment(uint256 ethAmount, uint256 era) → uint256
splitBury(currentEra, currentEraBuried, nethMintedThisEra, ethAmount)
    → nethOut, endingEra, endingEraBuried, endingNethMintedThisEra, completed[]
```

`completed[]` carries the `EraCompleted` tuples for eras filled by this amount.

## 7. Tests

Spec §17: tests that introduce the behavior ship with the slice. W2 does not run harvest, auction, fork, or production-adapter suites.

### 7.1 Unit — `EraMath.t.sol`

- era 0–7 match spec §5.2 (capacity, NETH/ETH, full-era issuance `10_000_000 ether`, cumulative Grave, gross supply)
- after completing era `n`, `G(n) = 10 * (2^(n+1) - 1) ether` and `S(n) = 10_000_000 ether * (n + 1)` (§15.1)
- `eraCapacity(e) * rewardRate(e) / 1 ether == 10_000_000 ether` for every `e` in `0..=maxEra` (exact at full-era scale; segment floors are tested separately)
- `rewardRate` never increases; `eraCapacity` never decreases as `e` increases
- `maxEra` is derived and equals 79 for these constants; `rewardRate(maxEra) > 0`; `rewardRate(maxEra + 1)` reverts
- spec §5.3 example: 1 ETH remaining in era 0 plus 3 ETH → `2_000_000 ether` NETH
- per-segment floor: `nethForSegment` equals `mulDiv` toward zero; never exceeds the unrounded rational

### 7.2 Unit — `Grave.t.sol`

- genesis: `protectedPrincipal`, `currentEra`, `currentEraBuried`, `totalNethMinted`, `neth.totalSupply`, `currentNAV` are 0 after `setGrave` and before any ETH
- `bury(0)` with `msg.value == 0` reverts; ETH is not taken
- era 0: `1 ether` → `1_000_000 ether` NETH to `msg.sender`; `protectedPrincipal == 1 ether`; ETH balance of Grave is `1 ether`
- exact era completion: bury 10 ETH in era 0 → `EraCompleted(0, 10 ether, 10_000_000 ether)`, `currentEra == 1`, `currentEraBuried == 0`
- one transaction crossing 1, 2, and many eras (at least eras 0–3 in one `bury`); do not revert merely for crossing
- `minNethOut`: succeeds when output ≥ min; reverts when a prior same-block burial moved the era and output would be below min
- `quoteBury` matches `bury` for the same state and amount
- mint is only via Grave after `setGrave`; random callers still cannot `neth.mint`
- `receive()` / `deal` / selfdestruct-style forced ETH increase `currentNAV` and `harvestableYield` but not `protectedPrincipal` or NETH supply
- `currentNAV() == address(this).balance`; `activeStrategy() == address(0)`
- zero-yield solvency for this slice: with only burials (no harvest), `protectedPrincipal` equals cumulative `msg.value` and is independent of donations
- no `withdraw` / `redeem` / `harvest` / `pause` / `owner` functions (compile-time or `staticcall` absence, same idea as NIP-0003)
- `bury` is protected against reentrancy (attempted reenter from a mint recipient must fail; ERC-20 mint has no receiver hook, so use a test harness or `ReentrancyGuard` coverage via a malicious `NETH` stub only if needed — do not replace production `NETH`)
- tiny burial that would mint 0 NETH reverts (`ZeroNethOut`); high-era arithmetic does not overflow for `e <= maxEra`
- rounding across a boundary does not pay more NETH than the sum of per-segment floors

### 7.3 Fuzz / property

```text
protectedPrincipal never decreases
protectedPrincipal increases by exactly msg.value on successful bury
total NETH minted == deterministic burial issuance (replay EraMath / spec split)
era reward rate never increases
era capacity never decreases
no admin path can mint NETH
donated ETH never mints NETH and never increases protectedPrincipal
quoteBury(eth) == bury output at the same pre-state
successful bury never returns ETH to the burier
currentEra only stays or increases
nethOut == 0 never succeeds
```

Do not use `deal` of NETH to “prove” mint. Replay issuance from ETH amounts and era state.

### 7.4 Invariant (`test/invariant/Grave.t.sol`)

Stateful handler: random `bury` (varying `msg.value` and `minNethOut`), `receive` donations, ordinary NETH transfers, and holder `burn`. Do not include harvest, auction, pause, or migration selectors.

Invariants: the §7.3 properties that remain globally true, plus `currentNAV >= protectedPrincipal` while there is no strategy that can lose money, and `neth.totalSupply() <= totalNethMinted` (holder `burn` may reduce supply; W2 must not attribute that as reaping).

### 7.5 Not in W2

- harvest at NAV below/equal/above principal, loss then recovery (W4)
- Reaper rate, fills, rollover (W3)
- Base fork tests (W5+/W6)
- deploy-script abort checks (W6)
- full §15.3 yield-scenario matrix (needs harvest); W2 only proves issuance and principal under 0% yield

Existing CI already runs `forge fmt --check`, `forge build --sizes`, and `forge test -vvv` from `contracts/`. Do not add a second workflow.

## 8. Implementation steps

Do not run these until this NIP is explicitly started.

1. Add `contracts/src/libraries/EraMath.sol` as in §3–§6. `pragma solidity 0.8.36;`. SPDX `UNLICENSED` ([NDR-0004](../ndr/0004-source-available-until-mainnet.md)).
2. Add `contracts/src/Grave.sol` as in §4, importing `NETH` and `EraMath`, inheriting `ReentrancyGuard` from `@openzeppelin/contracts/utils/ReentrancyGuard.sol`.
3. Add the unit, fuzz, and invariant tests in §7.
4. Do not change `NETH.sol`, `GraveStub.sol`, `foundry.toml`, remappings, OpenZeppelin/forge-std pins, or CI versions.
5. From `contracts/`: `forge fmt`, `forge build`, `forge test`.

## 9. Acceptance criteria

W2 is done when:

- `EraMath` is a pure library under `contracts/src/libraries/EraMath.sol` and is not a deployed monetary contract
- `Grave` is a separate production contract under `contracts/src/Grave.sol`, not merged into NETH
- era 0–7 and `G(n)` / `S(n)` match the spec tables; `maxEra` is derived from constants (79 for these constants)
- `bury()` mints only the split-path amount to `msg.sender`, increases `protectedPrincipal` by exactly `msg.value`, and keeps ETH idle on Grave
- crossing one or more era boundaries in one transaction succeeds and emits `EraCompleted` for each filled era
- `minNethOut` reverts when deterministic output is lower
- unsolicited ETH does not mint and does not raise `protectedPrincipal`
- there is no redemption, harvest, strategy, Reaper, pause, or proxy logic
- `forge fmt --check`, `forge build`, and `forge test` pass from `contracts/`
- NDR-0002 is still Proposed unless it is explicitly accepted in a later change

## 10. Not decided here

Leave these to later NIPs / NDRs, as queued in [`NIP-0000`](0000-the-roadmap.md):

- Reaper address wiring, auctions, burns (W3). Plan: [`NIP-0005`](0005-reaper.md)
- `IStrategyAdapter` use, harvest, depositing idle ETH into a strategy, `currentNAV` including adapter assets, timelock, Ownable (W4). Plan: [`NIP-0006`](0006-strategy.md)
- production adapter (W5; [`NIP-0007`](0007-aave-adapter.md))
- CREATE2, cost script, explorer verification (W6)
- accepting the compiler / OZ / Foundry freeze (NDR-0002)

No new NDR is required for this plan. The library split, idle ETH, and `EraCompleted` meaning of reckoning are already in [`NIP-0000`](0000-the-roadmap.md). Constructor-vs-setter for NETH is already [`NIP-0003`](0003-neth.md). Donation-as-surplus is spec §16.2. `maxEra` is spec §5.4 applied to §5.1 constants. Public APIs below are spec §6.1 / §12 / §13, not new surfaces.

W4 extends `Grave.sol` in place (same immutable monetary contract, additional strategy/harvest functions). Plan: [`NIP-0006`](0006-strategy.md). Keep principal accounting independent of `address(this).balance` so donations and later adapter NAV cannot rewrite `protectedPrincipal`.
