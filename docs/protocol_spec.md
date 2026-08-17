# Nether Protocol Specification

**Version:** 1.0  
**Target network:** Base Mainnet (chain ID 8453)  
**Native asset:** ETH  
**Token:** Nether (`NETH`), ERC-20, 18 decimals  
**Status:** Implementation specification

## 1. Purpose

Nether is a permanently capitalized monetary protocol deployed on Base. A user irreversibly buries ETH in the Grave and receives newly minted NETH. Buried ETH is protocol capital forever: it is never redeemable by the depositor, team, governance, Reaper, or any other beneficiary.

The Grave deploys its protected capital into a replaceable conservative ETH-denominated yield strategy. Realized economic yield above protected principal is transferred to the Reaper. The Reaper uses that ETH to acquire NETH through a protocol-native reverse Dutch auction and immediately burns all acquired NETH.

The protocol therefore combines:

1. irreversible ETH capitalization;
2. deterministic, era-based NETH issuance;
3. declining NETH issuance per ETH;
4. permanent productive capital;
5. yield-funded NETH demand;
6. permanent NETH destruction.

The monetary rules are immutable. Only the investment strategy holding the Grave's protected capital is replaceable.

## 2. Non-negotiable economic invariants

The implementation MUST preserve all of the following invariants.

| Invariant | Requirement |
|---|---|
| Burial finality | ETH submitted through `bury()` can never be redeemed by the burier. |
| Protected principal | `protectedPrincipal` equals cumulative ETH successfully buried and never decreases. |
| No principal spending | Reaper, governance, operators, and strategy managers cannot spend protected principal. |
| Yield-only Reaper | Reaper funding is limited to value demonstrably above `requiredBacking` after accounting for all prior harvested yield and live-adapter strategy losses. Capital marked impaired after a failed migration withdraw is excluded from `requiredBacking` and is not refilled from harvestable yield. |
| Loss recovery first | If active Grave capital falls below `requiredBacking`, no yield can be harvested until that live-adapter deficit has been recovered. Impairment of capital left in a former adapter does not zero harvest on remaining active capital. |
| Deterministic issuance | NETH issuance is determined only by the immutable era schedule and the ETH amount buried. |
| No discretionary minting | No admin, governance, strategy, or upgrade path can mint NETH. Only the Grave can mint according to the era algorithm. |
| Reaper burn | 100% of NETH acquired by the Reaper is burned immediately. |
| No protocol yield fee | 100% of harvestable yield is allocated to the Reaper. |
| No NETH price oracle | Core monetary logic never depends on a DEX spot price, TWAP, Chainlink NETH price, market capitalization, or external NETH oracle. |
| Strategy isolation | Replacing the Grave strategy cannot modify token issuance, era rules, Reaper pricing, or principal ownership. |

## 3. Base deployment assumptions

Production deployment is Base Mainnet, chain ID `8453`. ETH is the user-facing burial asset. When ERC-20 wrapped ETH is required by a strategy or DEX integration, the canonical Base WETH9 contract MUST be used.

The protocol contracts MUST NOT contain cross-chain monetary logic. Any investment strategy requiring bridging or an L1 position is encapsulated behind `IStrategyAdapter` and is subject to the same protected-principal accounting.

## 4. Token

### 4.1 NETH

`NETH` is a standard ERC-20 with:

- name: `Nether`
- symbol: `NETH`
- decimals: `18`
- no transfer tax;
- no rebasing;
- no blacklist;
- no admin mint;
- no admin burn of third-party balances;
- no pause on ordinary ERC-20 transfers.

The token MUST expose a mint function callable exclusively by the immutable Grave contract. The Reaper burns NETH it owns using the standard burn mechanism.

Recommended implementation foundation: audited OpenZeppelin Contracts 5.x ERC-20 components.

### 4.2 Supply

There is no fixed maximum supply expressed as a constant. Gross issuance is determined by completed and partially completed eras. Every full era mints exactly 10,000,000 NETH before Reaper burns.

Circulating and total supply can therefore diverge materially from gross historical issuance because Reaper purchases are permanently burned.

## 5. Era monetary policy

### 5.1 Constants

```text
INITIAL_ERA_CAPACITY = 10 ETH
INITIAL_REWARD_RATE  = 1,000,000 NETH per ETH
CAPACITY_MULTIPLIER  = 2
REWARD_DIVISOR       = 2
```

For era `e`, starting at `e = 0`:

```text
eraCapacity(e) = 10 ETH * 2^e
rewardRate(e)  = 1,000,000 NETH / 2^e per ETH
```

Therefore:

```text
eraCapacity(e) * rewardRate(e) = 10,000,000 NETH
```

for every complete era.

### 5.2 Era table

| Era | ETH capacity | NETH / ETH | NETH issued if full | Cumulative Grave after full era | Gross supply |
|---:|---:|---:|---:|---:|---:|
| 0 | 10 | 1,000,000 | 10,000,000 | 10 ETH | 10M |
| 1 | 20 | 500,000 | 10,000,000 | 30 ETH | 20M |
| 2 | 40 | 250,000 | 10,000,000 | 70 ETH | 30M |
| 3 | 80 | 125,000 | 10,000,000 | 150 ETH | 40M |
| 4 | 160 | 62,500 | 10,000,000 | 310 ETH | 50M |
| 5 | 320 | 31,250 | 10,000,000 | 630 ETH | 60M |
| 6 | 640 | 15,625 | 10,000,000 | 1,270 ETH | 70M |
| 7 | 1,280 | 7,812.5 | 10,000,000 | 2,550 ETH | 80M |

### 5.3 Burial crossing era boundaries

A single `bury()` transaction MAY cross one or more era boundaries. The Grave MUST split the ETH amount internally and apply each era's rate only to the portion belonging to that era.

Example: Era 0 has 1 ETH remaining and a user buries 3 ETH.

```text
1 ETH * 1,000,000 = 1,000,000 NETH
2 ETH *   500,000 = 1,000,000 NETH
Total                2,000,000 NETH
```

The transaction MUST NOT revert merely because it crosses an era boundary.

The caller MUST supply `minNethOut`. The transaction reverts if deterministic output is below that amount. This protects users from an era transition caused by a prior transaction in the same block.

### 5.4 Precision

All calculations use 18-decimal fixed-point integer arithmetic. Era reward calculation MUST be implemented so that rounding always favors the protocol by at most one wei-equivalent of NETH per internal era segment. No fractional entitlement is stored between burials.

The implementation MUST define a maximum reachable era consistent with safe integer arithmetic. Once the reward rate would round to zero at token precision, further burial MUST revert. The implementation must calculate this boundary from constants rather than introducing a discretionary supply cap.

## 6. Grave

### 6.1 Burial

Primary interface:

```solidity
function bury(uint256 minNethOut) external payable returns (uint256 nethOut);
```

Requirements:

- `msg.value > 0`;
- process all crossed era segments;
- increase `protectedPrincipal` by exactly `msg.value`;
- mint the deterministic NETH amount to `msg.sender`;
- emit complete accounting events;
- move idle ETH into the active strategy according to the strategy adapter workflow.

Burial is irreversible immediately after successful transaction completion.

### 6.2 Protected principal accounting

```text
protectedPrincipal = total cumulative ETH buried
impairedCapital    = sum of unpaid impaired principal (initially 0)
requiredBacking    = protectedPrincipal - impairedCapital
currentNAV         = idleETH + activeStrategy.totalAssetsInETH()
harvestable        = max(0, currentNAV - requiredBacking - alreadyReservedForReaper)
```

`protectedPrincipal` only increases. It MUST NOT decrease. New `bury()` MUST NOT reduce `impairedCapital`. Only ETH actually returned from an impaired adapter reduces `impairedCapital`.

`currentNAV` is **active** Grave capital: idle ETH on Grave plus the **active** adapter only. Former adapters on the impaired list are not included.

`requiredBacking` is the harvest watermark. A harvest MUST never cause post-harvest NAV backing to fall below `requiredBacking`. A harvest MAY complete while `currentNAV < protectedPrincipal` when `impairedCapital > 0`.

Invariant: `impairedCapital == sum of owed[adapter]` over the impaired adapter list.

`alreadyReservedForReaper` means yield that has already been removed from strategy backing and transferred to the Reaper or a dedicated Reaper funding escrow. It MUST NOT be counted again.

### 6.3 Strategy losses

Live-adapter losses (no migration, or a migration that fully withdraws) leave `impairedCapital` and per-adapter owed amounts unchanged.

If:

```text
currentNAV < requiredBacking
```

then:

```text
harvestable = 0
```

independent of historical yield.

Future gains on **active** capital first restore NAV to `requiredBacking`. Only value above that watermark can subsequently be harvested.

`currentNAV < protectedPrincipal` after impairment MUST NOT by itself zero harvest forever. Yield earned on remaining active capital continues to go 100% to the Reaper.

No loss is socialized to NETH holders through new minting. No NETH is minted as compensation. No external recapitalization is required by the protocol. Harvestable yield MUST NOT be retained to refill historical Grave size.

### 6.4 Strategy interface

The only intentionally replaceable economic component is the Grave investment strategy.

The implementation MUST define an interface equivalent to:

```solidity
interface IStrategyAdapter {
    function depositETH() external payable;
    function withdrawETH(uint256 amount, address recipient)
        external
        returns (uint256 received);
    function totalAssetsInETH() external view returns (uint256);
    function underlying() external view returns (address);
}
```

An adapter MAY internally use WETH, ERC-4626 vault shares, LSTs such as wstETH, lending positions, or another approved ETH-denominated mechanism.

The strategy MUST NOT:

- mint NETH;
- call Reaper settlement functions as a seller;
- alter era state;
- transfer assets to arbitrary governance-selected recipients;
- borrow against Grave assets unless a later protocol version explicitly changes this specification through a new deployment;
- use leverage;
- hold directional non-ETH exposure as its intended source of return.

### 6.5 Strategy replacement

Strategy replacement is permitted only for safety, deprecation, or improved conservative capital deployment.

It requires:

1. proposal by the protocol multisig;
2. public on-chain scheduling;
3. a 14-day timelock when replacing an already-active adapter;
4. an adapter address fixed at scheduling time;
5. execution after the delay when replacing an already-active adapter; the first adapter (from unset) MAY be executed immediately after scheduling;
6. withdrawal/migration of all recoverable assets from the old adapter, with a bounded on-chain retry budget before leftover capital may be marked impaired (§6.6);
7. deposit into the new adapter;
8. post-migration NAV verification.

On-chain migration retry constants:

```text
STRATEGY_MIGRATION_WITHDRAW_FAILURE_LIMIT (N) = 3
STRATEGY_MIGRATION_RETRY_DELAY                = 1 day
```

Each `executeStrategyMigration` MUST attempt to pull all recoverable ETH from the old adapter into Grave.

- If the pull fully succeeds, complete migration: deposit idle ETH into the scheduled adapter, clear pending, and clear the failure counter.
- If the pull fails and the failure count for this pending migration is still below `N`, do **not** switch `activeStrategy`. Commit a failed attempt, start a 1-day cooldown, and emit a failure event. Pending remains.
- If the pull fails and this attempt is the `N`th failure, complete migration anyway: switch to the scheduled adapter, record impairment as specified in §6.6, and deposit whatever ETH actually sits on Grave into the new adapter.

The first execute of a pending replacement still requires the 14-day delay (or immediate first activation when none is active). After a recorded failure, a retry MAY run no sooner than `lastFailureTime + 1 day`; it MUST NOT restart the 14-day clock.

A failed attempt MUST be a state-changing success, not a Solidity revert of the whole transaction. A revert would undo the failure counter and make `N` unenforceable.

Cancel of a pending schedule clears pending, the failure counter, and the cooldown. A new schedule starts a new 14-day clock and a new `N` budget.

A migration execute fails the withdraw step when the old adapter is set and recoverable ETH is not fully obtained on Grave in that transaction. That includes `withdrawETH` reverting, `totalAssetsInETH` reverting so the pull cannot be sized from the view (the execute MUST still attempt a pull), and a non-reverting pull that leaves reported or remaining adapter assets unreceived.

ETH that does arrive on Grave during a failed attempt stays on Grave (idle). It is not sent back to the old adapter and is not sent to the owner. Later successful execute, or the impairing `N`th execute, deposits that idle ETH into the new adapter.

Do not treat a fabricated high `totalAssetsInETH` as proof of assets for lowering the harvest watermark. Impairment accounting uses observed Grave/active NAV, not the old adapter’s claimed NAV (§16.3).

The monetary contracts themselves are not proxy-upgradeable.

A strategy migration MUST NOT make protected principal withdrawable to the multisig. Migration functions must route recovered assets directly through the Grave and into the newly approved adapter.

An emergency pause MAY stop new strategy deposits, harvests, migrations, and Reaper auction creation. It MUST NOT enable principal withdrawal. ERC-20 transfers remain unpaused.

### 6.6 Impaired capital and permissionless recovery

After the retry budget in §6.5 is exhausted, leftover capital in the former adapter is **impaired**: still recoverable in principle, no longer part of active Grave capital, and no longer a reason to withhold Reaper yield.

There is still only one active investing adapter. Listed impaired adapters are residual pull sources, not a second strategy.

On the impairing execute (the `N`th failed pull), after any ETH received this transaction is on Grave and before or when switching adapters:

```text
observedActive = address(this).balance
                 + assets already in the new adapter (should be 0)
delta          = max(0, requiredBacking - observedActive)
impairedCapital += delta
owed[old]       += delta
```

That sets `requiredBacking` down to observed active capital at that instant, so harvestable is 0 immediately after impairment and future gains on remaining capital are harvestable. It MUST NOT mint harvestable yield out of a lying old NAV. If `old` is already on the list, add `delta` to the existing owed amount; do not reset it.

When `delta > 0`, write the old adapter into an on-chain list if it is not already present. Membership means this adapter still owes Grave, not that it currently holds ETH.

An adapter MUST remain on the list while `owed[adapter] > 0`. It MUST NOT be removed because an external balance is 0, `totalAssetsInETH()` returns 0 or reverts, `recoverImpaired` reverts or pays 0, a simulation suggests a pull would be useless, or a later `bury()` or live-adapter profit increased active capital.

A partial repay reduces `owed[adapter]` and `impairedCapital` by the credited pay and leaves the adapter on the list. Remove it if and only if `owed[adapter]` becomes 0 after an actual ETH receipt credited to that adapter. A bricked adapter that never pays stays on the list indefinitely.

Anyone MAY call permissionless `recoverImpaired(adapter)` when `owed[adapter] > 0`, subject to reentrancy protection. `withdrawETH` recipient is Grave only. Realized amount is the Grave balance delta, never the adapter’s return value alone:

```text
pay              = min(received, owed[adapter])
owed[adapter]   -= pay
impairedCapital -= pay
```

Active NAV rises by `received`. `requiredBacking` rises by `pay`. Recovered ETH up to `owed[adapter]` is principal returning, not harvestable yield. Any `received` above `owed[adapter]` is unsolicited surplus (§16.2), not a reason to reduce another adapter’s debt.

Then existing idle-deploy into the current `activeStrategy` (idle is allowed if deposit reverts). There is no cooldown, no protocol-imposed retry limit, and no owner-only gate on recover.

A reverting recover call MAY revert. The protocol MUST NOT try/catch recover in a way that credits `owed` / `impairedCapital` without ETH actually received, and MUST NOT drop the adapter on a 0-pay or reverting recover.

If `totalAssetsInETH` reverted for the whole attempt window, still list the adapter, still record `owed[old] += delta`, and still apply the `observedActive` formula (the missing ETH is whatever `requiredBacking` exceeded). Under-counting impaired capital is acceptable; over-counting from a fabricated NAV is not.

## 7. Yield harvesting

Anyone MAY call a permissionless `harvest()` when positive harvestable yield exists and the adapter can realize the required ETH.

Conceptually:

```text
NAV before harvest
- requiredBacking
- previously reserved Reaper ETH
= maximum harvestable yield
```

where `requiredBacking = protectedPrincipal - impairedCapital` (§6.2).

The realized amount is transferred to the Reaper funding balance.

Harvest MUST NOT pull active backing below `requiredBacking`. It MAY complete while `currentNAV < protectedPrincipal` when `impairedCapital > 0`.

No caller reward is paid from protected principal. If keeper incentives are required operationally, they must be funded externally or included as a bounded execution expense inside realized yield before the Reaper allocation; the production default is zero keeper incentive.

Harvest MUST use checks-effects-interactions and reentrancy protection.

If a strategy reports unrealized NAV that cannot safely be withdrawn as ETH, `harvest()` MUST be limited to the amount the adapter can actually realize without violating `requiredBacking` protection.

## 8. Reaper

### 8.1 Objective

The Reaper converts externally generated ETH yield into permanent NETH demand. It does not attempt to peg NETH, promise a floor price, or guarantee appreciation.

The Reaper does not trade on a DEX.

### 8.2 Auction model

The Reaper uses a continuous reverse Dutch auction with a single protocol-defined rate at every point in time.

There is no order book. Sellers do not place resting orders.

At any moment a holder chooses either:

- sell NETH immediately to the Reaper at the current deterministic rate; or
- wait for a better rate, accepting the risk that other sellers consume the available ETH budget first.

### 8.3 Auction creation

A new auction can be started permissionlessly whenever `availableReaperETH > 0` and no auction is active.

There is **no protocol-enforced absolute or percentage minimum Reaper budget**. This allows a micro-capitalized Grave to begin Reaping without waiting for an arbitrary threshold. Extremely small auctions may be irrational after Base gas costs; callers decide whether to start/fill them.

An auction snapshots:

- current era reward rate;
- available ETH budget allocated to that auction;
- start timestamp.

Only one active Reaper auction exists at a time.

Until an auction is started, harvested yield remains in `availableReaperETH`.

Unspent ETH from an expired auction rolls into the Reaper's available balance and can fund the next auction.

### 8.4 Auction duration and curve

Duration is exactly 7 days.

Let:

```text
R = snapshotted Grave reward rate in NETH per ETH
x = elapsed / 7 days, bounded to [0, 1]
```

The seller-required NETH per ETH is:

```text
reaperRate(x) = R * (2.00 - 0.95 * x)
```

Thus:

```text
start = 2.00 * R
end   = 1.05 * R
```

The curve is linear in NETH-per-ETH.

Because fewer NETH per ETH means a better price for the NETH seller, the offer becomes monotonically more favorable to sellers throughout the auction.

The rate is snapshotted against the era at auction creation. A subsequent era transition does not modify an active auction.

### 8.5 Selling to Reaper

Primary interface:

```solidity
function sellToReaper(
    uint256 nethIn,
    uint256 minEthOut
) external returns (uint256 ethOut);
```

At execution:

```text
ethOut = nethIn / currentReaperRate
```

subject to fixed-point scaling.

If `ethOut` exceeds remaining auction ETH, the contract MUST partially fill up to the remaining ETH budget and take only the corresponding amount of NETH. The unused NETH remains with the seller.

The transaction reverts if actual ETH output is below `minEthOut`.

Settlement order:

1. calculate rate and fill;
2. transfer the exact filled NETH amount from seller;
3. burn that NETH immediately;
4. decrement auction ETH;
5. transfer ETH to seller;
6. emit settlement event.

The function MUST be non-reentrant.

### 8.6 Why the Reaper has no NETH oracle

Suppose the DEX offers more NETH per ETH than the Reaper currently requires. An arbitrageur can buy NETH on the DEX and sell it to the Reaper. That arbitrage creates external NETH buy pressure without the Reaper interacting with the DEX.

If the Reaper price is unattractive, nobody sells and the deterministic auction continues improving for sellers.

This mechanism performs decentralized price discovery without trusting a manipulable NETH spot oracle.

### 8.7 Auction expiration

At exactly 7 days the rate stops at `1.05 * R`.

After expiration:

- no further sales are accepted into that auction;
- remaining ETH returns to `availableReaperETH`;
- anyone may finalize the auction;
- a new auction may begin whenever available Reaper ETH is greater than zero.

The Reaper never crosses below the 1.05 multiplier during an auction.

## 9. Genesis, launch, and optional markets

Nether v1 requires **no founder capital contribution, no founder burial, no protocol-owned liquidity, and no DEX market**.

Immediately after deployment:

```text
protectedPrincipal = 0
currentEra = 0
currentEraBuried = 0
NETH totalSupply = 0
Reaper available ETH = 0
```

The first burial may be made by any address. There is no economic minimum burial; the only lower bound is the smallest positive ETH amount that produces at least one smallest unit of NETH after deterministic rounding.

### 9.1 No genesis market price

`1 ETH -> 1,000,000 NETH` in Era 0 is an issuance rule, not a price, peg, redemption rate, floor, or protocol valuation. Nether does not establish an initial NETH market price.

### 9.2 Markets are external and optional

A NETH market is not required for Grave, harvesting, Reaper auctions, or burning.

Any third party MAY independently create a NETH market on Aerodrome, Uniswap, another Base DEX, or an OTC venue. Such markets are outside the Nether trust boundary.

Core Nether contracts MUST NOT create/seed DEX pools, own LP positions, require a DEX, contain DEX-specific trading logic, use a DEX price for monetary policy, or subsidize liquidity from Grave principal or Reaper yield.

If an external market exists, arbitrageurs may naturally connect its price to Reaper auction opportunities. Nether neither requires nor coordinates this.

### 9.3 Optional later market milestone

A public NETH/WETH market MAY be a later ecosystem roadmap milestone after sufficient NETH distribution and organic interest exist. Aerodrome on Base is one candidate venue, not a protocol dependency.

Any project-associated market initiative must separately evaluate voluntary liquidity, pool design, LP ownership, manipulation risk, and disclosures. It cannot modify Nether v1 monetary contracts.

## 10. Governance and permissions

### 10.1 Monetary core

The following are immutable after deployment:

- initial era capacity;
- initial reward rate;
- era capacity multiplier;
- era reward divisor;
- NETH token address;
- Grave address;
- Reaper address;
- Reaper 7-day duration;
- Reaper 2.00 start multiplier;
- Reaper 1.05 end multiplier;
- no Reaper minimum budget (any positive available Reaper ETH);
- 100% Reaper burn rule;
- 100% harvestable-yield allocation to Reaper;
- protected-principal semantics.

No proxy can modify these values.

### 10.2 Administrative authority

Administrative authority is a multisig, not an EOA.

Production administrative authority MUST use a multisig-capable account rather than a single deployer EOA. To minimize launch cost, Nether MAY use existing audited Base multisig/account infrastructure instead of deploying custom multisig code. Replacement of an already-active adapter executes only through the required 14-day timelock. The initial adapter, while none is active, MAY be executed immediately after scheduling.

The admin can:

- schedule a new strategy adapter;
- execute a scheduled strategy migration after 14 days when an adapter is already active, or immediately when none is active;
- retry a pending migration execute after a recorded withdraw failure, no sooner than 1 day later, without restarting the 14-day clock;
- cancel a pending schedule (clears the retry budget);
- pause strategy-sensitive operations during an emergency;
- unpause after remediation.

Permissionless callers, not only the admin, MAY `recoverImpaired` from a listed former adapter into Grave and then into the single active adapter.

The admin cannot:

- withdraw protected principal;
- mint NETH;
- change era parameters;
- change Reaper curve;
- redirect Reaper ETH;
- seize user NETH;
- withdraw genesis locked liquidity;
- send recovered or migrated ETH to the owner or an arbitrary EOA;
- drop an impaired adapter from the list while `owed[adapter] > 0`.

Access control SHOULD use audited OpenZeppelin 5.x primitives. A timelock/multisig arrangement must be explicit and tested; production ownership must never remain with the deployer EOA.

## 11. Contract architecture

Required logical components:

| Component | Responsibility | Upgradeability |
|---|---|---|
| `NETH` | ERC-20, Grave-only mint, holder/Reaper burn | Immutable |
| `Grave` | burial, eras, protected principal, strategy accounting | Immutable |
| `Reaper` | yield balance, reverse Dutch auctions, settlement, burn | Immutable |
| `StrategyManager` / strategy slot | controlled adapter migration | Mutable adapter only |
| `IStrategyAdapter` | strategy-specific ETH deployment and NAV | Replaceable |
| Timelock mechanism | 14-day strategy-change delay; lowest-cost audited implementation satisfying this specification | Governance infrastructure |
| Multisig-capable admin | propose/cancel emergency administration; preferably existing deployed infrastructure | External governance |

Contracts SHOULD be small and responsibility-separated. Avoid a monolithic contract combining ERC-20, strategy calls, and auction settlement.

## 12. Required public views

At minimum the frontend and indexers require:

```text
currentEra()
currentEraCapacity()
currentEraBuried()
currentRewardRate()
quoteBury(ethAmount)
protectedPrincipal()
impairedCapital()
requiredBacking()
currentNAV()
harvestableYield()
activeStrategy()
impairedOwed(adapter)
impairedAdapterCount()
impairedAdapterAt(index)
availableReaperETH()
activeAuction()
currentReaperRate()
quoteReaperSale(nethAmount)
totalNethMinted()
totalNethReaped()
```

`quoteBury()` MUST correctly simulate crossing multiple era boundaries.

## 13. Required events

At minimum:

```text
Buried(user, ethAmount, nethMinted, endingEra)
EraCompleted(era, ethBuried, nethMinted)
StrategyDeposit(strategy, ethAmount)
YieldHarvested(ethAmount, reaperBalance)
StrategyMigrationScheduled(oldStrategy, newStrategy, executeAfter)
StrategyMigrated(oldStrategy, newStrategy, navBefore, navAfter)
StrategyMigrationWithdrawFailed(oldStrategy, newStrategy, attempt, reason)
StrategyImpaired(oldStrategy, newStrategy, impairedDelta, impairedCapital)
ImpairedRecovered(adapter, received, pay, impairedCapital)
EmergencyPause(account)
EmergencyUnpause(account)
ReapingStarted(auctionId, ethBudget, snapshottedRewardRate, startTime, endTime)
Reaped(auctionId, seller, nethBurned, ethPaid, rate)
ReapingFinalized(auctionId, ethSpent, nethBurned, ethRolledOver)
```

Events are part of the protocol's transparency surface and MUST contain enough information to reconstruct historical issuance and Reaper performance without trusting the frontend.

## 14. Frontend behavior

The primary product language is burial, not staking.

The UI MUST clearly state before confirmation:

> Buried ETH is permanent. You cannot withdraw it. In exchange, the protocol mints NETH according to the current era. The Grave deploys its capital to earn yield, and harvestable yield funds the Reaper.

The burial screen displays:

- current era;
- current NETH/ETH reward;
- ETH remaining in era;
- estimated NETH output;
- breakdown across eras if the transaction crosses a boundary;
- permanent/non-redeemable warning.

The Reaper screen displays:

- available/active ETH budget;
- auction time remaining;
- current NETH required per ETH;
- current ETH received for the user's entered NETH;
- total historical NETH reaped/burned;
- explicit warning that waiting may improve the rate but the budget can be consumed by others.

The Grave dashboard displays:

- cumulative ETH buried;
- protected principal;
- impaired capital and per-adapter owed amounts;
- the impaired adapter list (do not hide an adapter that still owes because its venue balance is 0);
- required backing (harvest watermark);
- current strategy NAV (active capital only; do not display impaired ETH as active Grave capital);
- current strategy;
- realized yield sent to Reaper;
- Reaper Ratio where market data is available.

Market-derived analytics such as market cap and Reaper Ratio are informational frontend metrics only and never enter contract logic.

## 15. Economic model

### 15.1 Grave growth

After completing era `n`:

```text
G(n) = 10 * (2^(n+1) - 1) ETH
```

Gross historical issuance:

```text
S(n) = 10,000,000 * (n + 1) NETH
```

before Reaper burns.

This is the central asymmetry: protected capital grows geometrically with completed eras while gross issuance grows linearly.

### 15.2 Reaper budget

For annualized ETH-denominated yield `y`:

```text
annualReaperBudget ~= G * y
```

Illustrative 2.2% case:

| Completed era | Grave | Gross NETH | Annual Reaper ETH |
|---:|---:|---:|---:|
| 0 | 10 | 10M | 0.22 |
| 1 | 30 | 20M | 0.66 |
| 2 | 70 | 30M | 1.54 |
| 3 | 150 | 40M | 3.30 |
| 4 | 310 | 50M | 6.82 |
| 5 | 630 | 60M | 13.86 |
| 6 | 1,270 | 70M | 27.94 |
| 7 | 2,550 | 80M | 56.10 |

These are scenario values, not promised returns.

### 15.3 Stress-test yield assumptions

Engineering and economic tests MUST evaluate at least:

| Scenario | Annual ETH yield |
|---|---:|
| Zero-yield | 0.0% |
| Adverse | 1.0% |
| Conservative | 1.5% |
| Reference | 2.2% |
| Favorable | 3.0% |

The protocol MUST remain solvent at 0% yield. Zero yield means the Reaper receives nothing; it must not affect protected principal or issuance correctness.

### 15.4 Counter-cyclical Reaper power

A useful analytical metric is:

```text
Reaper Ratio = annualized harvestable yield / NETH market capitalization
```

This metric is not an on-chain control input.

At constant Grave and yield, a lower NETH valuation mechanically increases the fraction of market value that the Reaper can purchase. A higher valuation reduces Reaper relative power. Therefore the mechanism is counter-cyclical but does not guarantee a price floor.

### 15.5 Reference-price analysis

At a market price equal to the active era's burial issuance price, and using 2.2% annual yield, theoretical annual buyback capacity as a fraction of gross supply evolves approximately as:

| Era | At 1.00x burial price | At 0.50x | At 0.25x | At 0.10x |
|---:|---:|---:|---:|---:|
| 0 | 2.20% | 4.40% | 8.80% | 22.00% |
| 1 | 1.65% | 3.30% | 6.60% | 16.50% |
| 2 | 1.28% | 2.57% | 5.13% | 12.83% |
| 3 | 1.03% | 2.06% | 4.13% | 10.31% |
| 4 | 0.85% | 1.71% | 3.41% | 8.53% |
| 5 | 0.72% | 1.44% | 2.89% | 7.22% |
| 6 | 0.62% | 1.25% | 2.49% | 6.23% |
| 7 | 0.55% | 1.10% | 2.19% | 5.48% |

This simplified table ignores AMM slippage, auction execution, already-burned supply, strategy losses, and changing yield. It is a stress-test intuition, not a forecast.

### 15.6 Issuance arbitrage

When market NETH trades above the effective burial issuance price, rational actors may bury ETH, mint NETH, and sell it. This behavior:

- creates near-term NETH sell pressure;
- permanently increases Grave protected capital;
- increases future potential Reaper yield.

This feedback is intentional. The protocol MUST NOT block burial because NETH trades above or below an external market price.

### 15.7 Reaper arbitrage

When the Reaper's current offer becomes better than the external DEX price, arbitrageurs may:

1. buy NETH on the DEX;
2. sell NETH to the Reaper;
3. capture the spread.

This is intentional. The resulting DEX purchase transmits Reaper demand to the external market while avoiding direct Reaper market orders and eliminating the need for a NETH oracle.

## 16. Security model

### 16.1 Threats to explicitly test

The implementation and audit MUST cover:

- reentrancy during burial, harvest, strategy withdrawal, and Reaper settlement;
- malicious or reverting strategy adapter;
- strategy NAV misreporting;
- fee-on-transfer or non-standard strategy assets;
- rounding exploitation across era boundaries;
- same-block era transition slippage;
- partial-fill rounding in Reaper;
- Reaper budget exhaustion races;
- forced ETH transfers to contracts;
- donation attacks that attempt to classify donated ETH as yield;
- strategy loss followed by recovery;
- governance key compromise;
- timelock bypass;
- strategy migration to an asset-stealing adapter;
- inability to recover from a deprecated strategy (retry budget, then impaired list and permissionless recover);
- owner burning the migration retry budget in one block;
- dropping an impaired adapter while it still owes ETH;
- ERC-20 approval races;
- denial of service through tiny transactions;
- arithmetic behavior at very high era numbers;
- MEV around Reaper fills;
- genesis pool/address mistakes.

### 16.2 Forced ETH and donations

Unexpected ETH sent directly to Grave MUST NOT increase `protectedPrincipal` and MUST NOT mint NETH. Donations and forced ETH MUST NOT reduce `impairedCapital` or any owed amount.

It may be treated as protocol surplus/yield only if accounting can distinguish it safely. The simpler recommended implementation treats unsolicited ETH as surplus backing and permits it to become harvestable only when total NAV exceeds `requiredBacking`. This cannot reduce depositor claims because there are no redemption claims. Surplus received on `recoverImpaired` above that adapter’s owed amount is this same class of unsolicited ETH (§6.6); it MUST NOT reduce another adapter’s debt.

Direct ETH transfers to Reaper outside the defined funding path MAY increase Reaper available balance but MUST emit/account for donations separately from harvested yield.

### 16.3 Strategy trust boundary

Because an adapter can report NAV, strategy approval is the principal governance trust boundary. Production adapters MUST be audited and MUST calculate NAV from verifiable on-chain balances/exchange rates.

A strategy adapter MUST NOT be able to make the Grave transfer principal to an arbitrary EOA merely by returning fabricated NAV.

Where possible, Grave should pull specific amounts from the adapter and verify actual ETH received rather than trusting reported return values.

## 17. Testing requirements

Use Foundry as the primary Solidity development and test framework unless implementation constraints require an equivalent EVM framework.

Required test classes:

### Unit tests

- every era formula;
- exact era completion;
- one transaction crossing 1, 2, and many eras;
- `minNethOut`;
- NETH mint authorization;
- burn behavior;
- principal monotonicity;
- harvest at NAV below/equal/above `requiredBacking`;
- harvest while `currentNAV < protectedPrincipal` when `impairedCapital > 0`;
- loss then recovery on the live adapter;
- Reaper rate at start, midpoint, end, and after expiration;
- full and partial Reaper fills;
- rollover;
- auction start with any positive available Reaper ETH (no minimum budget);
- strategy scheduling, 14-day replacement delay, and immediate first activation;
- migration withdraw failures: `N-1` committed failed executes (adapter unchanged, 1-day cooldown), then an `N`th execute that switches, lists the old adapter when `delta > 0`, and raises `impairedCapital`;
- permissionless `recoverImpaired`: partial repay leaves the adapter listed; remove only when owed reaches 0 from credited ETH; 0-pay and reverting recovers do not drop the adapter or reduce owed.

### Fuzz/property tests

Properties MUST include:

```text
protectedPrincipal never decreases
impairedCapital == sum of owed[adapter] over the impaired list
bury does not reduce impairedCapital or any owed amount
donated / forced ETH does not reduce impairedCapital or any owed amount
harvest never decreases protectedPrincipal
post-successful-harvest currentNAV >= requiredBacking
total NETH minted == deterministic burial issuance
Reaper can never spend Grave principal
Reaper-acquired NETH never remains in Reaper after successful settlement
currentReaperRate is monotonic seller-favorable during an auction
era reward rate never increases
era capacity never decreases
no admin path can mint NETH
an impaired adapter stays listed while owed[adapter] > 0
```

### Fork tests

Base fork tests MUST validate:

- canonical WETH interaction;
- selected initial strategy adapter;
- harvest realization;
- strategy migration;
- real token decimal/exchange-rate behavior.

### Invariant testing

Run stateful invariant tests with randomized burial, harvest, auction, settlement, donation, pause, migration scheduling, failed migration withdraw retries, impaired recovery, and strategy profit/loss actions.

## 18. Deployment procedure and launch-cost constraint

### 18.1 Hard operator budget

The project operator's intended Base mainnet launch expenditure is **no more than USD 10-15 equivalent in ETH**, including contract-deployment gas and required setup transactions.

This is an operational budget target, not an on-chain invariant or guaranteed cost: Base gas and ETH/USD prices vary. Deployment MUST be simulated against current Base fees immediately before launch.

If the complete required deployment is estimated above USD 15 equivalent, the launch script MUST stop. The operator should wait for cheaper conditions or remove non-core deployment overhead; monetary/security rules must not be weakened to meet the budget.

The operator is not required to fund founder burial, NETH purchases, DEX liquidity, Reaper capitalization, or Grave capitalization. Grave capital comes from users who voluntarily bury ETH.

### 18.2 Cost minimization

To keep launch feasible:

- deploy no DEX/LP contracts and perform no liquidity transactions;
- do not deploy custom multisig infrastructure when suitable audited deployed Base infrastructure can be reused;
- minimize separately deployed helper contracts;
- use custom errors and compact immutable monetary code;
- avoid proxy infrastructure for the monetary core;
- deploy only the strategy adapter required for initial production operation;
- batch safe configuration calls where possible;
- do all development, fuzzing, fork tests, and dry runs before mainnet.

Gas optimization MUST NOT compromise auditability, protected-principal isolation, or immutable monetary rules.

### 18.3 Production sequence

1. Freeze compiler, dependencies, and OpenZeppelin versions.
2. Complete local, invariant, and Base fork tests.
3. Estimate the complete remaining Base mainnet deployment/configuration cost at current fees.
4. Abort if the estimate exceeds USD 15 equivalent.
5. Deploy the initial strategy adapter if a dedicated adapter is required.
6. Establish multisig-capable administration and the 14-day strategy-change delay with the lowest-cost audited architecture satisfying this specification.
7. Deploy NETH.
8. Deploy Grave.
9. Deploy Reaper.
10. Finalize Grave-only NETH mint authority.
11. Configure strategy-management permissions.
12. Transfer all administrative authority away from the deployer EOA.
13. Verify contracts on a Base explorer.
14. Run post-deployment invariant and permission checks.
15. Confirm `protectedPrincipal == 0`, `NETH.totalSupply() == 0`, and no active Reaper auction.
16. Enable the public frontend.

There is no founder burial and no genesis liquidity transaction.

Deployment scripts MUST abort on any chain ID, address, permission, bytecode, configuration, cost-budget, or post-condition mismatch.

## 19. Observability

The production system MUST expose/index enough data to display:

- ETH buried by era and in total;
- NETH minted by era and in total;
- NETH burned by Reaper;
- current protected principal;
- strategy NAV;
- realized yield;
- historical Reaper budgets;
- auction fill rates;
- average NETH/ETH acquired by Reaper;
- unspent rollover;
- current and historical strategy addresses.

Monitoring MUST alert on:

- NAV below protected principal;
- unexpected strategy NAV discontinuity;
- failed harvests;
- strategy migration schedule;
- emergency pause;
- Reaper ETH/NETH accounting mismatch;
- privileged role changes.

## 20. Explicit non-goals

Version 1 MUST NOT implement:

- ETH redemption;
- NETH staking rewards;
- protocol borrowing or leverage;
- algorithmic NETH peg;
- NETH collateralized lending;
- direct Reaper swaps on Aerodrome/Uniswap;
- NETH price oracle;
- discretionary monetary governance;
- team mint allocation;
- transfer taxes;
- reflection mechanics;
- protocol-owned or automatically managed liquidity;
- mandatory DEX integration;
- cross-chain NETH issuance;
- strategy diversification across multiple simultaneous adapters.

These features require a separate future protocol/version analysis and MUST NOT be silently added by the implementation agent.

## 21. Implementation decisions

The following decisions are final for Nether v1:

| Decision | Final value |
|---|---|
| Network | Base Mainnet |
| Burial asset | Native ETH |
| Token | NETH ERC-20, 18 decimals |
| Era 0 capacity | 10 ETH |
| Era 0 reward | 1,000,000 NETH/ETH |
| Era capacity progression | x2 |
| Reward progression | /2 |
| Full-era gross issuance | 10,000,000 NETH |
| Principal redemption | Impossible |
| Yield allocation | 100% Reaper |
| Reaper execution | Protocol-native reverse Dutch auction |
| Reaper order book | None |
| Auction duration | 7 days |
| Start rate | 2.00x snapshotted burial reward rate |
| End rate | 1.05x snapshotted burial reward rate |
| Curve | Linear in NETH/ETH |
| Minimum auction budget | None; any positive available Reaper ETH |
| Unspent budget | Roll forward |
| Reaped NETH | Burn immediately |
| NETH price oracle | None |
| Genesis founder burial | None |
| Founder capital requirement | None |
| Genesis liquidity | None |
| DEX dependency | None |
| Optional future market | External milestone; Aerodrome/Uniswap are candidates |
| Monetary core | Immutable/non-proxy |
| Strategy | Replaceable adapter |
| Strategy change delay | 14 days when replacing an active adapter; initial set from unset may execute immediately |
| Migration withdraw failure limit | 3 recorded failed pulls, then impair |
| Migration retry delay | 1 day between failed execute attempts; does not restart the 14-day clock |
| Strategy leverage | Forbidden |
| Protocol yield fee | 0% |
| Strategy selection | Intentionally implementation-time configurable within this specification's constraints |

## 22. Agent implementation mandate

An implementation agent receiving this document MUST treat Sections 1-21 as requirements, not suggestions.

The agent MAY choose:

- internal code organization;
- gas optimizations that preserve exact economics;
- test helper structure;
- frontend framework;
- indexer technology;
- the initial Grave investment strategy, provided it satisfies all strategy constraints and is separately justified for Base.

The agent MUST NOT reinterpret or change:

- monetary constants;
- era mathematics;
- burial finality;
- protected-principal rules;
- required-backing / impaired-capital harvest accounting;
- Reaper auction economics;
- burn behavior;
- yield allocation;
- zero-founder-capital genesis rules;
- governance limits;
- strategy timelock;
- absence of NETH price oracle.

Before production deployment, the agent MUST produce:

1. contract architecture and call-flow diagrams;
2. exact Solidity interfaces;
3. storage-layout documentation;
4. threat model;
5. complete test plan and passing results;
6. Base fork-test results;
7. strategy-specific risk analysis;
8. deployment and rollback/emergency runbook;
9. independent smart-contract audit findings and remediation status.

## 23. Roadmap boundaries

| Milestone | Scope |
|---|---|
| M0 | Local contracts, property tests, economic simulation, Base fork tests |
| M1 | Base Sepolia end-to-end deployment and frontend |
| M2 | Minimal Base mainnet core launch within the operator's USD 10-15 deployment budget |
| M3 | Observe real burial, strategy yield, and Reaper behavior; improve off-chain analytics |
| M4 | Optional external/community NETH market on Aerodrome, Uniswap, or another Base venue if organic demand exists |
| M5 | Additional audited Grave strategy adapters without changing monetary contracts |

A DEX market is deliberately not a prerequisite for mainnet launch.

## 24. Reference implementation sources

The implementation should verify all production addresses and current interfaces immediately before deployment. Useful authoritative references include:

- Base documentation: https://docs.base.org/
- OpenZeppelin Contracts 5.x: https://docs.openzeppelin.com/contracts/5.x
- Aerodrome documentation (optional future external market only): https://aerodrome.finance/docs
- Lido wstETH documentation (if used by the selected strategy): https://docs.lido.fi/contracts/wsteth/

References describe external infrastructure only. Nether's monetary policy is defined exclusively by this specification.
