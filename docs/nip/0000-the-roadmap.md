# NIP-0000: The Roadmap

- Status: Living plan (adjustable on demand; not an NDR)
- Date: 2026-08-13
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Decision log: [`ndr/README.md`](../ndr/README.md)
- Scaffolding: [`0001-scaffolding.md`](0001-scaffolding.md)
- NETH: [`0003-neth.md`](0003-neth.md)
- Grave: [`0004-grave.md`](0004-grave.md)
- Reaper: [`0005-reaper.md`](0005-reaper.md)
- Strategy: [`0006-strategy.md`](0006-strategy.md)
- Landing: [`0002-landing-docs.md`](0002-landing-docs.md)

This document sequences implementation work. It does not change monetary rules, governance limits, or launch constraints. The spec wins on protocol behavior. This plan can be revised as work proceeds; do not freeze it as an NDR.

Implementation choices that are **not** already in the spec or an NDR still need an NDR when they constrain later work (strategy selection, toolchain freeze, frontend stack).

## 1. How this maps to the spec

[`protocol_spec.md`](../protocol_spec.md) §23 already defines product milestones. This roadmap is the engineering breakdown underneath them.

| Spec milestone | Meaning | This roadmap |
|---|---|---|
| M0 | Local contracts, property tests, economic simulation, Base fork tests | W0–W5 plus the M0 test/sim gate |
| M1 | Base Sepolia end-to-end deployment and frontend | W6 (Sepolia) + W7 (frontend) |
| M2 | Minimal Base mainnet core within the USD 10–15 operator budget | W6 (mainnet) after audit and §22 artifacts |
| M3 | Observe real burial, yield, and Reaper behavior; improve analytics | W8 in production |
| M4 | Optional external NETH market | W9; not a launch prerequisite |
| M5 | Additional audited strategy adapters | After M2; monetary contracts unchanged |

A DEX market is not required for M1 or M2 (§9, §23).

## 2. Layout

| # | Starting layout | Workstream | Notes |
|---|---|---|---|
| 1 | Scaffold Solidity / OpenZeppelin / toolchain | **W0** | [`NIP-0001`](0001-scaffolding.md) |
| 2 | `$NETH` ERC-20 | **W1** | [`NIP-0003`](0003-neth.md); Grave-only mint (§11) |
| 3 | Burying ETH, Grave, reckoning, eras | **W2** | [`NIP-0004`](0004-grave.md); era math library split out; reckoning = `EraCompleted` |
| 4 | Reaper reverse Dutch auction | **W3** | [`NIP-0005`](0005-reaper.md); independent of the first production adapter |
| 5 | Investment interface, yield to Reaper, strategy governance | **W4** | [`NIP-0006`](0006-strategy.md); harvest, pause, timelock, **test invest adapter** |
| 6 | AAVE pool for MVP | **W5** | Most probable; specific choice TBD with NDR |
| 7 | Landing site and dashboard | **W7** | Two surfaces, one workstream; FE stack [`NDR-0003`](../ndr/0003-frontend-stack.md); first slice [`NIP-0002`](0002-landing-docs.md) |
| 8 | Grave Keeper (cranker) bot | **W8** | Pair with observability |
| 9 | Aerodrome market (optional) | **W9** | After M2; outside the trust boundary |
| — | *(not in the starting layout)* | **W6** | Deployment / Sepolia / mainnet kit (§18) |
| — | *(not in the starting layout)* | M2 gates | Audit and §22 design artifacts |

Do not unite W1+W2 into one contract, or W4+W5 into one delivery. Do unite harvest with W4 (not with the Reaper auction), and monitoring with W8.

Approved extra splits: era math as a pure library (W2); a test-only invest adapter (W4).

## 3. Workstreams

Each workstream is a reviewable slice. Tests required by §17 are part of the slice that introduces the behavior, not a phase at the end.

### W0 — Scaffold

Detailed plan: [`0001-scaffolding.md`](0001-scaffolding.md).

Prepare a Foundry workspace under `contracts/` (spec §17), OpenZeppelin Contracts 5.x (spec §4.1, §10.2), formatting, and CI that runs `forge test` (and later invariant/fork jobs). Reserve sibling trees for the landing/dashboard and Gravekeeper so those environments never mix with Solidity.

Working compiler and dependency versions are listed in Proposed [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md). That record is **not accepted yet**. Spec §18.3 freeze happens when it is accepted (late M0 / before M2). W0 may use the proposed versions as the working set.

No proxy or upgradeability scaffolding for NETH, Grave, or Reaper. Monetary contracts are immutable at deploy (§10.1, §11, §21).

Out of scope for W0: protocol logic, frontend implementation, keeper implementation.

### W1 — NETH

Detailed plan: [`0003-neth.md`](0003-neth.md).

Implement the ERC-20 in spec §4:

- name `Nether`, symbol `NETH`, 18 decimals
- no transfer tax, rebase, blacklist, admin mint, admin burn of third-party balances, or pause on ordinary transfers
- mint callable only by the immutable Grave
- standard burn used by the Reaper on NETH it owns

Deployment order in §18.3 is NETH, then Grave, then lock mint authority. W1 should make that wiring explicit (constructor, one-time setter that then becomes immutable, or equivalent) without leaving a standing admin mint. [`NIP-0003`](0003-neth.md) uses a one-time `setGrave` lock.

### W2 — Grave: eras, burial, reckoning

Detailed plan: [`0004-grave.md`](0004-grave.md).

Implement spec §5–§6.1 and the burial-related views/events in §12–§13.

Break the work internally:

1. **Era math library** (approved split): capacity, reward rate, multi-era split, rounding that favors the protocol by at most one wei-equivalent of NETH per internal era segment, and the maximum reachable era derived from constants (not a discretionary cap). `minNethOut` is the `bury()` slippage check.
2. **`bury()`**: irreversible capitalization, `protectedPrincipal` monotonicity, mint to `msg.sender`, era-boundary crossings in one transaction.
3. **Reckoning**: the era-change event. Emit `EraCompleted(era, ethBuried, nethMinted)` whenever an era fills, including when a single `bury()` crosses one or more era boundaries.
4. **Idle ETH** until a strategy is configured: buried ETH may sit as idle backing so W2 is testable before W4/W5.

[`NIP-0004`](0004-grave.md) puts `minNethOut` on `bury()`, derives `maxEra` from constants (79 for §5.1), and keeps ETH idle on Grave. Reckoning is `EraCompleted` with era-level totals.

W2 must not implement strategy migration, harvest, or Reaper logic.

### W3 — Reaper

Detailed plan: [`0005-reaper.md`](0005-reaper.md).

Implement spec §8: permissionless auction start when `availableReaperETH > 0` and no auction is active; 7-day linear reverse Dutch auction from `2.00 * R` to `1.05 * R`; partial fills; immediate burn; rollover; no NETH oracle; no DEX.

There is no protocol-enforced minimum auction budget. Any positive available Reaper ETH may start an auction. Callers decide whether a given size is rational after gas. Until an auction is started, harvested yield remains in `availableReaperETH`.

W3 can be built against NETH plus test-injected Reaper ETH. Production funding comes from harvest in W4.

[`NIP-0005`](0005-reaper.md) puts §12 Reaper views on `Reaper` (not Grave), takes NETH and Grave as constructor immutables, credits `receive()` ETH as donations unless `msg.sender` is Grave, and leaves Grave unchanged until W4 harvest.

### W4 — Strategy interface, harvest, and strategy governance

Detailed plan: [`0006-strategy.md`](0006-strategy.md).

This is the replaceable economic surface. Spec §6.4–§6.5, §7, §10–§11.

Internal breakdown:

1. `IStrategyAdapter` exactly as specified (or equivalent, documented if the surface must differ — that difference needs an NDR).
2. **Test invest adapter** (approved split): idle ETH or a scripted profit/loss adapter for unit, fuzz, and invariant tests so M0 does not depend on AAVE. Do not deploy it on mainnet (§18.2). Place it under `contracts/test/`, not `contracts/src/`.
3. Protected-principal high-watermark accounting, `harvest()`, loss-recovery-first, donation/forced-ETH handling (§6.2–§6.3, §7, §16.2).
4. Strategy scheduling, 14-day timelock, migration that routes recovered assets through the Grave into the new adapter, post-migration NAV check.
5. Emergency pause of strategy-sensitive operations, harvests, migrations, and Reaper auction creation — not ERC-20 transfers, and not principal withdrawal.
6. Multisig-capable admin using existing audited Base infrastructure where possible; production ownership must leave the deployer EOA (§10.2, §18).

Admin authority is strategy replacement (timelocked) and emergency pause only. It is not upgradeability of NETH, Grave, or Reaper.

[`NIP-0006`](0006-strategy.md) keeps the strategy slot on Grave (no separate `StrategyManager`), uses `Ownable2Step` plus an embedded 14-day delay, one-time `setReaper`, harvest that sends ETH immediately to Reaper, pause on Grave that Reaper reads before `startAuction`, and a test-only invest adapter under `contracts/test/mocks/`.

### W5 — Initial production strategy (AAVE candidate)

Spec §21 leaves the initial strategy implementation-time configurable inside the stated constraints. Spec §22 requires a Base-specific justification. [`ndr/README.md`](../ndr/README.md) lists strategy adapter selection as an NDR example.

AAVE on Base is the most probable MVP adapter. The specific pool, underlying, NAV source, and realization path are TBD and must be recorded in an NDR before adapter code. Path:

1. Proposed NDR: named AAVE deployment on Base, pool, underlying (WETH vs native ETH), NAV source, withdrawal/realization path, leverage prohibition evidence, failure modes.
2. Thorough review against §2, §6.4, §16.3.
3. Adapter implementation, Base fork tests, strategy-specific risk analysis (§22).

If the NDR is rejected or the adapter cannot satisfy principal protection, M0 can still complete with the test invest adapter; M2 cannot ship without an accepted production adapter.

### W6 — Deployment kit, Sepolia, mainnet

Spec §18. Launch gate, not polish.

- Deterministic deploy scripts that abort on chain ID, address, permission, bytecode, config, cost-budget, or post-condition mismatch
- Cost estimate vs USD 10–15 equivalent; abort above USD 15
- No DEX/LP, no custom multisig if reusable Base infrastructure exists, no extra helper contracts, no monetary-core proxies
- M1: Base Sepolia end-to-end, including frontend against Sepolia
- M2: mainnet sequence in §18.3, including explorer verification and post-deploy invariant/permission checks
- Rollback/emergency runbook (§22)

Sepolia may iterate by redeploying. Mainnet monetary contracts are immutable at deploy.

### W7 — Landing site and project dashboard

Spec §14. Primary product language is burial, not staking. Required confirmation copy, burial screen, Reaper screen, and Grave dashboard are specified. Market-derived metrics (market cap, Reaper Ratio) are frontend-only and must not enter contract logic.

Two surfaces in one workstream, one frontend environment under `apps/web/`:

- **Landing:** what Nether is, irreversible burial, no redemption, no promised peg
- **App:** bury, quote, era state, Grave NAV, Reaper auction, warnings

Frontend stack is [`NDR-0003`](../ndr/0003-frontend-stack.md) (Astro static HTML, GitHub Pages, Tailwind). First public slice is [`NIP-0002`](0002-landing-docs.md): holder + Documentation from `docs/**`. Bury/Reaper/dashboard screens are a later W7 NIP on the same tree.

Indexer technology is still TBD at W8. Live dashboard numbers are expected to read spec §12 views via `viem` islands, not an indexer.

W7 landing can start before contracts exist. The app surface can start against the §12 view surface once W2/W3 exist. Frontend must not block M0 contract tests.

### W8 — Grave Keeper and observability

`harvest()`, auction start, and auction finalize are permissionless. The keeper is an operator convenience, not a privileged role. Spec §7: production default keeper incentive is zero; any incentive must not come from protected principal.

Keeper loop (minimum):

- harvest when harvestable yield is realizable
- start a Reaper auction when ETH is available and none is active
- finalize expired auctions

The keeper lives under `apps/keeper/` with its own environment. Language and runtime are TBD when W8 starts; record that choice as an NDR then.

Observability (§19) belongs with this workstream: issuance and burn history, NAV, harvests, auctions, strategy address changes, and alerts (NAV below principal, pause, role changes, harvest failures, migration schedule). M3 is the production hardening of this surface.

Indexer technology is still TBD; record it in an NDR when W8 needs one. Do not couple it to NDR-0003.

### W9 — Optional Aerodrome market

Spec §9, §20, M4. Core contracts must not create pools, own LP, trade on a DEX, or use a DEX price. A later project-associated market, if any, is a separate milestone with its own liquidity, disclosure, and risk review. It cannot modify v1 monetary contracts.

## 4. Cross-cutting gates

These are not extra product features. They constrain when a milestone is done.

### 4.1 Tests (every contract workstream; M0 gate)

Spec §17: Foundry unit tests, fuzz/property tests, Base fork tests, stateful invariants, and the §15.3 yield scenarios including 0% yield solvency. Economic simulation is part of M0, not a substitute for invariants.

### 4.2 Spec §22 artifacts (before M2)

Produce incrementally, freeze before audit:

1. Contract architecture and call-flow diagrams
2. Exact Solidity interfaces
3. Storage-layout documentation
4. Threat model
5. Complete test plan and passing results
6. Base fork-test results
7. Strategy-specific risk analysis
8. Deployment and rollback/emergency runbook
9. Independent audit findings and remediation status

### 4.3 Independent audit (before M2)

Required by §22. W5’s production adapter is in scope. A mock-only audit is not sufficient for mainnet.

## 5. Decisions recorded in this revision

These answers are from review of the draft. They are recorded here so the plan stays usable. They are not a substitute for the spec. The plan remains editable.

| Topic | Decision |
|---|---|
| Upgradeability | None for now. Follow the spec: NETH, Grave, and Reaper are immutable at deploy. Admin is strategy timelock + emergency pause only. Sepolia may iterate by redeploy. |
| Reckoning | The era-change event: `EraCompleted` when an era fills (including mid-`bury()` boundary crossings). Not NAV, harvest, or Reaper settlement. See [`NIP-0004`](0004-grave.md). |
| Initial strategy | AAVE is the most probable MVP adapter. Specific deployment/pool/NAV details TBD in an NDR before W5 code. |
| Reaper minimum budget | None. Leftover pre-1.0 wording in the spec was cleaned to match §21. See [`NIP-0005`](0005-reaper.md). |
| Frontend stack | [`NDR-0003`](../ndr/0003-frontend-stack.md); first slice [`NIP-0002`](0002-landing-docs.md). Indexer still TBD (W8). |
| Keeper language / runtime | TBD when W8 requires a choice; then an NDR. |
| Repo layout | Isolated `contracts/`, `apps/web/`, and `apps/keeper/` trees. See [`NIP-0001`](0001-scaffolding.md). |
| NETH mint lock | One-time `setGrave`, then immutable; no standing admin. See [`NIP-0003`](0003-neth.md). |
| Toolchain versions | Proposed in [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md); not frozen until that NDR is accepted. |
| This plan | Living NIP. Adjust on demand. Do not copy it into an NDR. |
| Extra splits | Era math library (W2) and test invest adapter (W4) are in scope. W2 plan: [`NIP-0004`](0004-grave.md). W4 plan: [`NIP-0006`](0006-strategy.md). |

Nearby setup authority that is *not* monetary upgradeability, and is already in the spec:

- one-time mint-authority wiring from deployer to Grave
- strategy adapter replacement via timelock
- emergency pause/unpause of strategy-sensitive operations
- transferring admin from deployer to a multisig-capable account

## 6. NDR queue

Do not accept these until the question is actually being decided. A Proposed record may exist earlier as a working draft.

| Topic | Needed before | Notes |
|---|---|---|
| Compiler / OZ / Foundry version freeze | M2 (can wait until late M0) | Spec §18.3. Draft: [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md) (Proposed) |
| `IStrategyAdapter` surface change, if any | W4 | Only if the spec interface is insufficient |
| Initial production strategy (AAVE candidate) | W5 | Required; AAVE is probable, not accepted |
| Frontend framework | W7 landing | [`NDR-0003`](../ndr/0003-frontend-stack.md) (Accepted). Plan: [`NIP-0002`](0002-landing-docs.md) |
| Indexer | W8 | Still TBD; live views can use §12 + RPC without one |
| Keeper language / runtime | W8 | When a stack must be chosen |
| Any Aerodrome/LP design | W9 | Must not touch v1 monetary contracts |

Routine mechanical work (typos, tests that restore documented behavior) does not need an NDR. Revising this roadmap does not need an NDR.

## 7. Suggested order and parallelism

```text
W0 scaffold
 └─ W1 NETH ([`NIP-0003`](0003-neth.md))
     ├─ W2 Grave ([`NIP-0004`](0004-grave.md); era math library → bury → reckoning / EraCompleted → idle ETH)
     │    └─ W4 strategy interface, harvest, timelock, pause, test invest adapter ([`NIP-0006`](0006-strategy.md))
     │         └─ W5 production adapter (after NDR)
     └─ W3 Reaper ([`NIP-0005`](0005-reaper.md); can overlap W2 once NETH exists)
            └─ W4 harvest credits Reaper; pause includes auction creation ([`NIP-0006`](0006-strategy.md))

M0 gate: W1–W5 tests, invariants, economic sim, Base fork tests
 ├─ W6 Sepolia deploy kit
 ├─ W7 frontend (holder/docs: [`NIP-0002`](0002-landing-docs.md); app screens after W2/W3 views)
 └─ W8 keeper + indexing (can start after harvest/auction exist)

M1: Sepolia + frontend
Audit + §22 artifacts
M2: mainnet (budget gate)
M3: W8 production hardening
M4: W9 optional
M5: further adapters
```

W3 should not wait for AAVE. W7 holder/docs ([`NIP-0002`](0002-landing-docs.md)) should not wait for contracts. W7 app screens should not wait for W5. M2 should wait for W5, audit, and the cost script.

## 8. Explicit non-goals for v1

Do not add, even as “helpful” extras (spec §20): ETH redemption, NETH staking, leverage, peg, NETH lending, Reaper DEX swaps, NETH price oracle, discretionary monetary governance, team mint, transfer taxes, reflections, protocol-owned liquidity, mandatory DEX integration, cross-chain issuance, or multiple simultaneous adapters.
