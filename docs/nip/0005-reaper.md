# NIP-0005: Reaper — reverse Dutch auction

- Status: Implemented
- Date: 2026-08-14
- Workstream: W3
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Working versions: Proposed [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md) (not accepted)
- License: [`NDR-0004`](../ndr/0004-source-available-until-mainnet.md) (`SPDX-License-Identifier: UNLICENSED`)

This plan is the W3 breakdown. It implements spec §8 and the Reaper views/events in §12–§13. It does not implement harvest, strategy adapters, pause, or a DEX.

## 1. Purpose

Ship an immutable `Reaper` that turns ETH in its funding balance into permanent NETH demand through a protocol-native reverse Dutch auction and immediate burn. Production ETH comes from Grave harvest in W4. This slice is testable with NETH, Grave, and test-injected Reaper ETH ([`NIP-0000`](0000-the-roadmap.md) W3).

The Reaper does not peg NETH, promise a floor, trade on a DEX, or read a NETH oracle (spec §8.1, §8.6, §21).

## 2. Scope

In scope:

- `Reaper` as a separate production contract under `contracts/src/Reaper.sol`
- Permissionless auction start when `availableReaperETH > 0` and no auction is active
- 7-day linear reverse Dutch auction from `2.00 * R` to `1.05 * R`, with `R` snapshotted from Grave at start
- Partial fills, immediate burn, expiration, and unspent rollover
- §12 Reaper views and §13 Reaper events
- Donation vs harvest accounting for incoming ETH (spec §16.2)
- Unit, fuzz, and stateful invariant tests required by spec §17 for rate, fills, rollover, and burn

Out of scope:

- `harvest()`, strategy adapters, timelock, pause, `YieldHarvested` / `StrategyDeposit` / migration events (W4)
- Wiring a Reaper address into Grave (W4 harvest credits Reaper; Grave is deployed before Reaper, spec §18.3)
- Deploy scripts (W6), frontend (W7), keeper (W8)
- Accepting NDR-0002
- Proxies, upgradeability, Ownable/AccessControl/Pausable on Reaper
- Changing NETH or Grave ([`NIP-0003`](0003-neth.md), [`NIP-0004`](0004-grave.md) already shipped)
- Uniting Reaper with NETH or Grave ([`NIP-0000`](0000-the-roadmap.md) §2)
- A Reaper math library split (not an approved extra split; keep curve math in `Reaper.sol`)

Do not implement DEX swaps, a NETH oracle, an order book, a minimum auction budget, or a `withdraw` of Reaper ETH to admin.

## 3. Constants and curve

Spec §8.4 and §21 are the monetary rules. Do not change them. Do not take duration or multipliers as constructor arguments.

```text
AUCTION_DURATION = 7 days                 // 604800 seconds
START_NUM        = 200                    // 2.00
END_NUM          = 105                    // 1.05
SLOPE_NUM        = 95                     // 2.00 - 1.05
DENOM            = 100
WAD              = 1 ether
```

Let `R` be the snapshotted Grave reward rate (NETH wei per ETH, same units as `Grave.currentRewardRate()`).

```text
elapsed = min(block.timestamp - startTime, AUCTION_DURATION)
x       = elapsed / AUCTION_DURATION            // in [0, 1]
reaperRate(x) = R * (2.00 - 0.95 * x)
```

Integer form, one `mulDiv` (OpenZeppelin 5.x `Math.mulDiv`, floor / toward zero):

```text
reaperRate = mulDiv(R, 200 * AUCTION_DURATION - 95 * elapsed, 100 * AUCTION_DURATION)
```

Thus:

```text
start (elapsed = 0)                    = 2.00 * R
end   (elapsed = AUCTION_DURATION)     = 1.05 * R
```

Fewer NETH per ETH is better for the seller. The rate is monotonically seller-favorable during an auction. It never goes below `1.05 * R` during that auction. A later era transition on Grave MUST NOT modify `R` or the active curve (spec §8.4).

Use OpenZeppelin `Math.mulDiv`. Do not add PRBMath, Solady, or Solmate ([`NIP-0001`](0001-scaffolding.md) §5).

### 3.1 Settlement rounding

`R` and `reaperRate` are NETH wei per ETH. Burial already floors NETH out (protocol-favorable, [`NIP-0004`](0004-grave.md) §3.2). Reaper rounding is also protocol-favorable:

```text
ethOut = floor(nethIn * WAD / reaperRate)
```

That is spec §8.5 `ethOut = nethIn / currentReaperRate` with WAD scaling.

If `ethOut` exceeds remaining auction ETH, partial-fill:

```text
ethOut    = remaining auction ETH
nethTaken = ceil(ethOut * reaperRate / WAD)
```

capped at `nethIn`. Unused NETH stays with the seller (never transferred). OpenZeppelin `Math.mulDiv(..., Math.Rounding.Ceil)` for the NETH-in ceiling.

Full fill takes `nethIn` and pays the floored ETH. Partial fill takes the ceiled NETH for the remaining ETH. Both pay at least the current rate in NETH per ETH.

If `ethOut == 0` after rounding, revert (do not no-op). `minEthOut` is a slippage check on `sellToReaper`, not part of the rate formula.

`quoteReaperSale` MUST use the same fill path.

## 4. Reaper surface

File: `contracts/src/Reaper.sol`. Inherit OpenZeppelin `ReentrancyGuard` ([`NIP-0001`](0001-scaffolding.md) §5). Do not add `Ownable`, `Pausable`, or a strategy slot in this slice.

```text
pragma solidity 0.8.36;

constructor(address neth_, address grave_)   // reject address(0) and EOAs (extcodesize == 0)

neth() → NETH                                // immutable
grave() → Grave                              // immutable; view-only except classifying harvest ETH
availableReaperETH() → uint256               // 0 at deploy; ETH not allocated to an active auction
totalNethReaped() → uint256                  // 0 at deploy; Reaper settlement burns only
totalHarvestedETH() → uint256                // 0 at deploy; ETH received from Grave
totalDonatedETH() → uint256                  // 0 at deploy; ETH received from anyone else + surplus
activeAuction() → Auction                    // see §4.3; zeroed / active=false at deploy
currentReaperRate() → uint256                // 0 if no active auction; else curve at now
quoteReaperSale(uint256 nethAmount) → uint256

startAuction() → uint256 auctionId
sellToReaper(uint256 nethIn, uint256 minEthOut) → uint256 ethOut
finalizeAuction()
collectSurplus() → uint256 amount            // permissionless; see §4.5
receive() payable
```

§12 Reaper views live on `Reaper`, not on Grave. Spec §11 wants responsibility-separated contracts. W7 can call `Reaper` directly, the same way [`NIP-0004`](0004-grave.md) has W7 call `Grave` for burial views. Do not add forwarding views to Grave in this slice.

Do not add burial views, `harvest()`, or pause.

### 4.1 Constructor and wiring

Spec §18.3: deploy NETH, deploy Grave, deploy Reaper, then finalize Grave-only mint. Reaper’s constructor takes the already-deployed `NETH` and `Grave` addresses. Both are immutable. There is no `setGrave` / `setNeth` on Reaper.

Reaper calls `grave.currentRewardRate()` only when starting an auction. It MUST NOT call `bury`, pull ETH from Grave, or otherwise spend protected principal.

W3 does not write a Reaper address into Grave. W4 harvest sends ETH from Grave to Reaper (`receive` classifies `msg.sender == grave` as harvested yield). Pause of auction creation is also W4.

W3 tests: deploy `NETH(setter)`, deploy `Grave(neth)`, `neth.setGrave(grave)`, deploy `Reaper(neth, grave)`, bury to mint seller NETH, send ETH to Reaper, then auction.

### 4.2 Funding: available ETH, donations, harvest

There is no protocol-enforced minimum budget (spec §8.3, §21, [`NIP-0000`](0000-the-roadmap.md) §5). Any positive `availableReaperETH` may start an auction.

Until an auction is started, incoming ETH stays in `availableReaperETH`. ETH that arrives **during** an active auction also stays in `availableReaperETH`; it is not added to that auction’s remaining budget. The next `startAuction` after finalize may include it.

```text
receive() payable
  credit msg.value to availableReaperETH
  if msg.sender == grave: totalHarvestedETH += msg.value
  else: totalDonatedETH += msg.value; emit ReaperDonation(msg.sender, msg.value)
```

Direct transfers outside harvest MUST be accounted separately from harvested yield (spec §16.2). `YieldHarvested` stays a Grave event in W4. W3 only classifies the credit so W4 can send ETH without a new Reaper setter.

Test-injected ETH is a donation (tester is not Grave). That is enough to run auctions before harvest exists.

`startAuction` allocates **all** `availableReaperETH` to the new auction (spec §8.3 snapshot of available ETH budget). There is no caller-chosen budget argument.

Invariant:

```text
address(this).balance >= availableReaperETH + activeAuction.ethRemaining
```

### 4.3 Auction lifecycle

```text
struct Auction {
    uint256 id;                     // 0 = never started
    uint256 ethBudget;              // snapshotted available ETH at start
    uint256 ethRemaining;
    uint256 snapshottedRewardRate;  // R
    uint256 startTime;
    uint256 endTime;                // startTime + 7 days
    uint256 nethBurned;
    bool active;
}
```

Only one active auction at a time.

`startAuction()` (permissionless, `nonReentrant`):

1. `_collectSurplus()`.
2. Revert if `activeAuction.active`.
3. Revert if `availableReaperETH == 0`.
4. `R = grave.currentRewardRate()`. Revert if `R == 0` (defensive; Grave eras with a positive rate cannot be 0).
5. Snapshot `R`, `ethBudget = availableReaperETH`, `startTime = block.timestamp`, `endTime = startTime + 7 days`.
6. Set `availableReaperETH = 0`, `ethRemaining = ethBudget`, `nethBurned = 0`, `active = true`, increment `id` from 0 (first auction is 1).
7. Emit `ReapingStarted(id, ethBudget, R, startTime, endTime)`.

`sellToReaper` is accepted while `active && block.timestamp < endTime`. At `endTime` the auction is expired: the rate view sits at `1.05 * R` until finalize, but no further sales.

`finalizeAuction()` (permissionless, `nonReentrant`):

1. Revert unless `active && block.timestamp >= endTime`.
2. `_collectSurplus()`.
3. `ethRolledOver = ethRemaining`; add it to `availableReaperETH`; set `ethRemaining = 0`; `active = false`.
4. Emit `ReapingFinalized(id, ethBudget - ethRolledOver, nethBurned, ethRolledOver)`.

Do not auto-start the next auction. W8’s keeper loop is start and finalize as separate permissionless calls ([`NIP-0000`](0000-the-roadmap.md) W8).

After finalize, `currentReaperRate()` is 0 until the next start. Leave the last struct in storage with `active = false` so `activeAuction()` can still show the most recent id/budget; `active` is the live flag.

### 4.4 `sellToReaper`

```solidity
function sellToReaper(uint256 nethIn, uint256 minEthOut)
    external
    nonReentrant
    returns (uint256 ethOut);
```

Requirements (spec §8.5):

1. An auction is active and `block.timestamp < endTime`.
2. `nethIn > 0`.
3. Compute `rate = currentReaperRate()`, then the fill in §3.1.
4. Revert if `ethOut < minEthOut`.
5. Settlement order: calculate fill; `transferFrom` the exact `nethTaken` from `msg.sender`; `neth.burn(nethTaken)` immediately; decrement `ethRemaining`; send ETH to `msg.sender` with OpenZeppelin `Address.sendValue`; emit `Reaped`.
6. Increase `totalNethReaped` by `nethTaken` only. Holder `burn` on NETH MUST NOT count as reaping ([`NIP-0003`](0003-neth.md)).

Checks-effects-interactions: update auction remaining and `totalNethReaped` before the ETH send. `transferFrom` + `burn` happen before the ETH send. `nonReentrant` covers a malicious seller `receive`.

The seller must `approve` Reaper. Do not add `permit`. Do not use `burnFrom` (that would require the seller to approve a burn of their own tokens through a different path); pull then burn Reaper’s own balance, which is the spec §4.1 “standard burn” of NETH the Reaper owns.

### 4.5 Surplus / forced ETH

Unexpected ETH that increases `address(this).balance` without `receive()` (test `deal`, historical `selfdestruct`) is not yet in `availableReaperETH`. Spec §16.2 MAY credit it as Reaper available balance and MUST count it as a donation, not harvest.

```text
surplus = address(this).balance - availableReaperETH - (active ? ethRemaining : 0)
```

`collectSurplus()` credits `surplus` to `availableReaperETH` and `totalDonatedETH`, and emits `ReaperDonation(address(this), surplus)`. Call it from `startAuction` and `finalizeAuction` as well so 1-wei dust can fund or roll.

### 4.6 Views

| View | Behavior |
|---|---|
| `availableReaperETH()` | Unallocated funding; 0 at deploy |
| `activeAuction()` | Current struct; `active == false` when none live |
| `currentReaperRate()` | 0 if `!active`; else §3 with `elapsed` bounded to `[0, AUCTION_DURATION]` |
| `quoteReaperSale(nethAmount)` | `ethOut` from the §3.1 path at the current state; reverts on the same invalid inputs as `sellToReaper` (`nethAmount == 0`, no live auction, expired, `ethOut == 0`) |
| `totalNethReaped()` | Cumulative `nethTaken` burned in settlement |

`quoteReaperSale` does not take `minEthOut`.

### 4.7 Custom errors and events

Use custom errors (spec §18.2). Suggested names, not a protocol requirement:

```text
ZeroAddress()
NotContract()
ZeroValue()
ZeroEthOut()
ZeroRewardRate()
AuctionActive()
NoActiveAuction()
AuctionExpired()
AuctionNotExpired()
InsufficientEthOut(uint256 ethOut, uint256 minEthOut)
```

```text
event ReapingStarted(uint256 indexed auctionId, uint256 ethBudget, uint256 snapshottedRewardRate, uint256 startTime, uint256 endTime);
event Reaped(uint256 indexed auctionId, address indexed seller, uint256 nethBurned, uint256 ethPaid, uint256 rate);
event ReapingFinalized(uint256 indexed auctionId, uint256 ethSpent, uint256 nethBurned, uint256 ethRolledOver);
event ReaperDonation(address indexed from, uint256 amount);
```

`ReaperDonation` is not in spec §13’s minimum list. Spec §16.2 requires donation accounting separate from harvest; the event is that log. Do not add DEX, oracle, or pause events.

## 5. What Reaper must not do

Spec §2, §8, §9, §10, §16, §20:

- no spend of Grave protected principal (no ETH pull from Grave, no `bury` reverse)
- no DEX swap, LP, or NETH price oracle
- no order book or resting orders
- no sale below `1.05 * R` during an auction, and no sale after expiration
- no second simultaneous auction
- no minimum-budget gate
- no admin redirect of Reaper ETH, no `withdraw` to owner
- no mint of NETH
- no counting holder `burn` as `totalNethReaped`
- no pause in W3 (W4 does not pause Reaper either; [`NDR-0005`](../ndr/0005-strategy-security.md))
- no proxy, UUPS, Beacon, or upgradeable OpenZeppelin modules
- no constructor-configurable curve (constants are the spec values)

## 6. Tree

Follow [`NIP-0001`](0001-scaffolding.md). Do not change `NETH.sol`, `Grave.sol`, `EraMath.sol`, or `GraveStub.sol`.

```
contracts/
├── src/
│   ├── NETH.sol                         unchanged
│   ├── Grave.sol                        unchanged
│   ├── Reaper.sol
│   └── libraries/
│       └── EraMath.sol                  unchanged
└── test/
    ├── unit/
    │   ├── NETH.t.sol                   unchanged
    │   ├── EraMath.t.sol                unchanged
    │   ├── Grave.t.sol                  unchanged
    │   └── Reaper.t.sol
    ├── fuzz/
    │   ├── NETH.t.sol                   unchanged
    │   ├── EraMath.t.sol                unchanged
    │   ├── Grave.t.sol                  unchanged
    │   └── Reaper.t.sol
    ├── invariant/
    │   ├── Grave.t.sol                  unchanged (still no auction selectors)
    │   └── Reaper.t.sol
    └── mocks/
        └── GraveStub.sol                unchanged; Reaper tests use real Grave
```

Do not add `src/interfaces/IReaper.sol` in this slice. An interface is a later §22 artifact if W6/docs need one. W7 can call `Reaper` directly.

Keep curve math in `Reaper.sol`. Suggested internal helpers (reshape as needed; one path for `quoteReaperSale` and `sellToReaper`):

```text
_rateAt(elapsed, R) → uint256
_fill(nethIn, rate, ethRemaining) → nethTaken, ethOut
_collectSurplus() → uint256
```

## 7. Tests

Spec §17: tests that introduce the behavior ship with the slice. W3 does not run harvest, pause, fork, or production-adapter suites.

Mint seller NETH by burying on the real Grave. Do not `deal` NETH to “prove” reaping, and do not attribute holder `burn` as reaped.

### 7.1 Unit — `Reaper.t.sol`

- genesis: `availableReaperETH`, `totalNethReaped`, `totalHarvestedETH`, `totalDonatedETH` are 0; `activeAuction.active == false`; `currentReaperRate() == 0`; no active auction after deploy (spec §9, §18.3 step 15)
- `receive` from a non-Grave address increases `availableReaperETH` and `totalDonatedETH`, emits `ReaperDonation`, and does not change Grave `protectedPrincipal`
- ETH from `address(grave)` increases `totalHarvestedETH` and not `totalDonatedETH` (use a test `vm.prank(address(grave))` send; Grave itself does not harvest in W3)
- `startAuction` with `availableReaperETH == 0` reverts; with 1 wei succeeds (no minimum budget)
- `startAuction` snapshots `grave.currentRewardRate()`, sets `endTime = start + 7 days`, zeroes `availableReaperETH`, emits `ReapingStarted`
- second `startAuction` while active reverts, even if more ETH arrived into `availableReaperETH`
- ETH sent during an active auction increases `availableReaperETH`, not `ethRemaining`
- rate at `elapsed = 0` is `2 * R`; at 3.5 days is `R * (2.00 - 0.95/2)` via the §3 formula; at `endTime` (view) is `1.05 * R`
- `currentReaperRate` never increases during an auction (seller-favorable: rate in NETH/ETH is non-increasing)
- crossing an era on Grave after start does not change the active auction’s `snapshottedRewardRate` or `currentReaperRate` path
- full fill: seller receives floored ETH, Reaper NETH balance is 0 after burn, `totalSupply` drops by `nethTaken`, `totalNethReaped` increases by `nethTaken`
- partial fill when `nethIn` would buy more ETH than remaining: remaining ETH goes to 0, unused NETH stays with the seller, auction can then only accept 0 ETH (further sells revert `ZeroEthOut` or equivalent until expire)
- `minEthOut`: succeeds when output ≥ min; reverts when a prior fill reduced remaining so output would be below min
- `quoteReaperSale` matches `sellToReaper` ETH out at the same pre-state
- after `endTime`, `sellToReaper` and `quoteReaperSale` revert; `currentReaperRate` still reports `1.05 * R` until finalize
- `finalizeAuction` before `endTime` reverts; after expiry rolls `ethRemaining` into `availableReaperETH`, emits `ReapingFinalized`, clears `active`
- a new auction may start after finalize whenever `availableReaperETH > 0` (rollover + deposits)
- holder `burn` decreases supply but not `totalNethReaped`
- Reaper operations do not decrease Grave `protectedPrincipal` or pull Grave ETH
- no `withdraw` / `harvest` / `pause` / `owner` / DEX functions (compile-time or `staticcall` absence, same idea as NIP-0003)
- `sellToReaper` is non-reentrant (malicious seller `receive` attempting to reenter start/sell/finalize fails)
- tiny `nethIn` that would pay 0 ETH reverts; `nethIn == 0` reverts
- surplus: `deal` extra ETH, `collectSurplus` / next `startAuction` credits it as donation

### 7.2 Fuzz / property

```text
Reaper can never spend Grave principal
Reaper-acquired NETH never remains in Reaper after successful settlement
currentReaperRate is monotonic seller-favorable during an auction
currentReaperRate never goes below 1.05 * snapshotted R during an auction
only one active auction
availableReaperETH + ethRemaining <= address(this).balance
totalNethReaped increases only by settlement burns
holder burn does not increase totalNethReaped
startAuction succeeds for any availableReaperETH > 0 when none is active
quoteReaperSale(neth) == sellToReaper ETH out at the same pre-state
successful sell never returns NETH to Reaper
era change after start does not change snapshotted R
donated ETH never mints NETH and never decreases protectedPrincipal
no admin path can mint NETH
```

Assume sellers, amounts, warps inside and beyond 7 days, and donation sizes. Replay fills from `R`, elapsed, and remaining ETH. Direct `deal` of NETH is not settlement; do not use it to “prove” burn accounting.

### 7.3 Invariant (`test/invariant/Reaper.t.sol`)

Stateful handler: random Grave `bury` (to mint NETH and move eras), NETH `approve` / `transfer` / holder `burn`, ETH donations to Reaper, `startAuction`, `sellToReaper`, `finalizeAuction` after expiry, `collectSurplus`, and warps. Do not include harvest, pause, or migration selectors.

Invariants: the §7.2 properties that remain globally true, plus `neth.balanceOf(reaper) == 0` except inside a settlement transaction, and `grave.protectedPrincipal` equals cumulative successful `bury` `msg.value`.

Do not replace or broaden `test/invariant/Grave.t.sol` in this slice.

### 7.4 Not in W3

- harvest at NAV below/equal/above principal, loss then recovery (W4)
- pause of auction creation (not W3; W4 none per [`NDR-0005`](../ndr/0005-strategy-security.md))
- Base fork tests (W5+/W6)
- deploy-script abort checks (W6)
- full §15.3 yield-scenario matrix (needs harvest); W3 only proves that with no injected ETH, no auction can start (0% yield → Reaper receives nothing from Grave)
- economic simulation of §15.2 annual Reaper budgets (needs yield)

Existing CI already runs `forge fmt --check`, `forge build --sizes`, and `forge test -vvv` from `contracts/`. Do not add a second workflow.

## 8. Implementation steps

Do not run these until this NIP is explicitly started.

1. Add `contracts/src/Reaper.sol` as in §3–§4, importing `NETH` and `Grave`, inheriting `ReentrancyGuard` from `@openzeppelin/contracts/utils/ReentrancyGuard.sol`, using `Math` and `Address` from OpenZeppelin. `pragma solidity 0.8.36;`. SPDX `UNLICENSED` ([NDR-0004](../ndr/0004-source-available-until-mainnet.md)).
2. Add the unit, fuzz, and invariant tests in §7.
3. Do not change `NETH.sol`, `Grave.sol`, `EraMath.sol`, `GraveStub.sol`, `foundry.toml`, remappings, OpenZeppelin/forge-std pins, or CI versions.
4. From `contracts/`: `forge fmt`, `forge build`, `forge test`.

## 9. Acceptance criteria

W3 is done when:

- `Reaper` is a separate production contract under `contracts/src/Reaper.sol`, not merged into NETH or Grave
- `NETH.sol` and `Grave.sol` are unchanged
- auctions start permissionlessly for any positive `availableReaperETH` when none is active, snapshot `R`, last exactly 7 days, and interpolate linearly from `2.00 * R` to `1.05 * R`
- a later era change does not modify an active auction
- `sellToReaper` partial-fills, burns 100% of taken NETH immediately, and never leaves acquired NETH on Reaper
- expired unspent ETH rolls into `availableReaperETH`; anyone may finalize; a new auction may follow
- donations are counted separately from ETH credited as harvest (`msg.sender == grave`)
- Reaper cannot spend Grave principal
- there is no DEX, oracle, order book, minimum budget, redemption, harvest, pause, or proxy logic
- `forge fmt --check`, `forge build`, and `forge test` pass from `contracts/`
- NDR-0002 is still Proposed unless it is explicitly accepted in a later change

## 10. Not decided here

Leave these to later NIPs / NDRs, as queued in [`NIP-0000`](0000-the-roadmap.md):

- Grave → Reaper harvest transfer, `alreadyReservedForReaper`, `YieldHarvested` (W4). Plan: [`NIP-0006`](0006-strategy.md)
- whether Grave stores Reaper via a one-time setter (needed because §18.3 deploys Reaper after Grave; W4). Plan: [`NIP-0006`](0006-strategy.md)
- pause of auction creation (W4 does not pause Reaper; [`NDR-0005`](../ndr/0005-strategy-security.md)). Plan: [`NIP-0006`](0006-strategy.md)
- `IStrategyAdapter` use, timelock, Ownable (W4). Plan: [`NIP-0006`](0006-strategy.md)
- production adapter (W5; [`NIP-0007`](0007-aave-adapter.md))
- CREATE2, cost script, explorer verification (W6)
- accepting the compiler / OZ / Foundry freeze (NDR-0002)

No new NDR is required for this plan. Separate `Reaper.sol`, no minimum budget, test-injected ETH, harvest-with-W4, and no DEX/oracle are already in [`NIP-0000`](0000-the-roadmap.md) and spec §8 / §11 / §21. Constructor immutables follow §18.3 (Grave exists before Reaper). Views on Reaper follow §11 separation and [`NIP-0004`](0004-grave.md) deferral. Donation vs harvest accounting is spec §16.2. Curve constants are spec §8.4 / §21. Public APIs below are spec §8 / §12 / §13, not new surfaces.

W4 extends `Grave.sol` for harvest; Reaper is unchanged except that Grave `send` is classified as harvest ([`NIP-0006`](0006-strategy.md)). There is no `grave.paused()` check on `startAuction` ([`NDR-0005`](../ndr/0005-strategy-security.md)). Keep Reaper ETH accounting independent of Grave `protectedPrincipal`.
