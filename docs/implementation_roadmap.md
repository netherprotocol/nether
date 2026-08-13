# Implementation roadmap

- Status: Draft for discussion
- Date: 2026-08-13
- Source of truth: [`protocol_spec.md`](protocol_spec.md)
- Decision log: [`ndr/README.md`](ndr/README.md)

This document sequences implementation work. It does not change monetary rules, governance limits, or launch constraints. Where this draft and the spec disagree, the spec wins until an NDR and a spec amendment say otherwise.

It is not an NDR. Workstream order, tooling pins, and the initial strategy remain open until accepted here or recorded as NDRs. Implementation must not start from this draft as if those choices were frozen.

## 1. How this maps to the spec

[`protocol_spec.md`](protocol_spec.md) §23 already defines product milestones. This roadmap is the engineering breakdown underneath them.

| Spec milestone | Meaning | This roadmap |
|---|---|---|
| M0 | Local contracts, property tests, economic simulation, Base fork tests | W0–W5 plus the M0 test/sim gate |
| M1 | Base Sepolia end-to-end deployment and frontend | W6 (Sepolia) + W7 (frontend) |
| M2 | Minimal Base mainnet core within the USD 10–15 operator budget | W6 (mainnet) after audit and §22 artifacts |
| M3 | Observe real burial, yield, and Reaper behavior; improve analytics | W8 in production |
| M4 | Optional external NETH market | W9; not a launch prerequisite |
| M5 | Additional audited strategy adapters | After M2; monetary contracts unchanged |

A DEX market is not required for M1 or M2 (§9, §23).

## 2. Proposed layout versus this draft

The starting layout is preserved. The changes below are sequencing and scope, not protocol redesign.

| # | Starting layout | Proposal | Why |
|---|---|---|---|
| 1 | Scaffold Solidity / OpenZeppelin / toolchain | Keep as **W0** | Unblocks everything else |
| 2 | `$NETH` ERC-20 | Keep as **W1**; do not fold into Grave | Spec §11: separate token contract; Grave-only mint |
| 3 | Burying ETH, Grave, reckoning, eras | Keep as **W2**; split era math from burial | Era arithmetic is high-risk and independently testable |
| 4 | Reaper reverse Dutch auction | Keep as **W3** | Independent of the first production adapter |
| 5 | Investment interface, yield to Reaper, strategy governance | Keep as **W4**; include harvest, pause, timelock, mock adapter | Spec §6–7 and §10 live here; a mock adapter unblocks M0 without AAVE |
| 6 | AAVE pool for MVP | Keep as **W5**; do not merge into W4 | Spec §22: initial strategy is a justified, NDR’d choice with its own fork tests and risk analysis |
| 7 | Landing site and dashboard | Keep as **W7**; two surfaces, one workstream | Spec §14; frontend framework is still open |
| 8 | Grave Keeper (cranker) bot | Keep as **W8**; pair with observability | Harvest/auction calls are permissionless; the bot is operations plus §19 monitoring |
| 9 | Aerodrome market (optional) | Keep as **W9**, after M2 | Spec §9.3 / M4; outside the trust boundary |
| — | *(not in the starting layout)* | Add **W6** deployment / Sepolia / mainnet kit | Spec §18 is a hard launch constraint |
| — | *(not in the starting layout)* | Add audit and §22 design artifacts as M2 gates | Spec §22 lists them as required before production |

Do not unite W1+W2 into one contract, or W4+W5 into one delivery. Do unite harvest with W4 (not with the Reaper auction), and monitoring with W8.

## 3. Workstreams

Each workstream is a reviewable slice. Tests required by §17 are part of the slice that introduces the behavior, not a phase at the end.

### W0 — Scaffold

Prepare a Foundry workspace (spec §17), OpenZeppelin Contracts 5.x (spec §4.1, §10.2), compiler/dependency versions, formatting, and CI that runs `forge test` (and later invariant/fork jobs).

Suggested repo shape, to be confirmed when W0 is implemented:

- `src/` — production contracts
- `test/` — unit, fuzz, invariant, fork tests
- `script/` — deploy and post-deploy checks
- `docs/` — spec, NDRs, this roadmap
- frontend and keeper trees only when W7/W8 start

W0 may pick working Foundry and OpenZeppelin versions. Spec §18.3 requires a later freeze of compiler, dependencies, and OpenZeppelin versions before production. That freeze is an NDR, not an implicit W0 decision.

Out of scope for W0: protocol logic, frontend, bots.

### W1 — NETH

Implement the ERC-20 in spec §4:

- name `Nether`, symbol `NETH`, 18 decimals
- no transfer tax, rebase, blacklist, admin mint, admin burn of third-party balances, or pause on ordinary transfers
- mint callable only by the immutable Grave
- standard burn used by the Reaper on NETH it owns

Deployment order in §18.3 is NETH, then Grave, then lock mint authority. W1 should make that wiring explicit (constructor, one-time setter that then becomes immutable, or equivalent) without leaving a standing admin mint.

### W2 — Grave: eras and burial

Implement spec §5–§6.1 and the burial-related views/events in §12–§13.

Break the work internally:

1. **Era math** as a small pure library: capacity, reward rate, multi-era split, `minNethOut`, rounding that favors the protocol by at most one wei-equivalent of NETH per internal era segment, and the maximum reachable era derived from constants (not a discretionary cap).
2. **`bury()`**: irreversible capitalization, `protectedPrincipal` monotonicity, mint to `msg.sender`, era-boundary crossings in one transaction, required events.
3. **Idle ETH** until a strategy is configured: buried ETH may sit as idle backing so W2 is testable before W4/W5.

The starting layout used “reckoning.” That word is not in the spec. This draft treats it as era-segment issuance accounting. If it was meant to include NAV, harvest, or Reaper settlement, those belong in W4 and W3 respectively. See [§5 open questions](#5-open-questions).

W2 must not implement strategy migration, harvest, or Reaper logic.

### W3 — Reaper

Implement spec §8: permissionless auction start when `availableReaperETH > 0` and no auction is active; 7-day linear reverse Dutch auction from `2.00 * R` to `1.05 * R`; partial fills; immediate burn; rollover; no NETH oracle; no DEX.

W3 can be built against NETH plus test-injected Reaper ETH. Production funding comes from harvest in W4.

Before writing Reaper code, resolve the leftover “minimum auction budget” wording in the spec (see [§5](#5-open-questions)). Spec §8.3 and §21 already decide there is no protocol-enforced minimum; some nearby sentences still talk as if there were one.

### W4 — Strategy interface, harvest, and strategy governance

This is the replaceable economic surface. Spec §6.4–§6.5, §7, §10–§11.

Internal breakdown:

1. `IStrategyAdapter` exactly as specified (or equivalent, documented if the surface must differ — that difference needs an NDR).
2. A **test/mock adapter** (idle ETH or a scripted profit/loss adapter). Use it for unit, fuzz, and invariant tests so M0 does not depend on AAVE. Do not deploy it on mainnet (§18.2).
3. Protected-principal high-watermark accounting, `harvest()`, loss-recovery-first, donation/forced-ETH handling (§6.2–§6.3, §7, §16.2).
4. Strategy scheduling, 14-day timelock, migration that routes recovered assets through the Grave into the new adapter, post-migration NAV check.
5. Emergency pause of strategy-sensitive operations, harvests, migrations, and Reaper auction creation — not ERC-20 transfers, and not principal withdrawal.
6. Multisig-capable admin using existing audited Base infrastructure where possible; production ownership must leave the deployer EOA (§10.2, §18).

W4 is where “upgrade authority until frozen” belongs as a discussion, not as proxy upgradeability of NETH/Grave/Reaper. See [§5.1](#51-upgrade-authority-until-frozen).

### W5 — Initial production strategy (AAVE candidate)

Spec §21 leaves the initial strategy implementation-time configurable inside the stated constraints. Spec §22 requires a Base-specific justification. [`ndr/README.md`](ndr/README.md) lists strategy adapter selection as an NDR example.

Do not treat AAVE as accepted in this roadmap. The intended path:

1. Proposed NDR: AAVE v3 (or named alternative) on Base, pool, underlying (WETH vs native ETH), NAV source, withdrawal/realization path, leverage prohibition evidence, failure modes.
2. Thorough review against §2, §6.4, §16.3.
3. Adapter implementation, Base fork tests, strategy-specific risk analysis (§22).

If the NDR is rejected or the adapter cannot satisfy principal protection, M0 can still complete with the mock adapter; M2 cannot ship without an accepted production adapter.

### W6 — Deployment kit, Sepolia, mainnet

Spec §18. Missing from the starting layout; it is a launch gate, not polish.

- Deterministic deploy scripts that abort on chain ID, address, permission, bytecode, config, cost-budget, or post-condition mismatch
- Cost estimate vs USD 10–15 equivalent; abort above USD 15
- No DEX/LP, no custom multisig if reusable Base infrastructure exists, no extra helper contracts, no monetary-core proxies
- M1: Base Sepolia end-to-end, including frontend against Sepolia
- M2: mainnet sequence in §18.3, including explorer verification and post-deploy invariant/permission checks
- Rollback/emergency runbook (§22)

### W7 — Landing site and project dashboard

Spec §14. Primary product language is burial, not staking. Required confirmation copy, burial screen, Reaper screen, and Grave dashboard are specified. Market-derived metrics (market cap, Reaper Ratio) are frontend-only and must not enter contract logic.

Two surfaces in one workstream:

- **Landing:** what Nether is, irreversible burial, no redemption, no promised peg
- **App:** bury, quote, era state, Grave NAV, Reaper auction, warnings

Frontend framework and indexer technology are explicitly left to implementation (§22). Choosing them should be a short NDR so later work does not re-pick the stack.

W7 can start against the §12 view surface once W2/W3 exist; it should not block M0 contract tests.

### W8 — Grave Keeper and observability

`harvest()`, auction start, and auction finalize are permissionless. The keeper is an operator convenience, not a privileged role. Spec §7: production default keeper incentive is zero; any incentive must not come from protected principal.

Keeper loop (minimum):

- harvest when harvestable yield is realizable
- start a Reaper auction when ETH is available and none is active
- finalize expired auctions

Observability (§19) belongs with this workstream: issuance and burn history, NAV, harvests, auctions, strategy address changes, and alerts (NAV below principal, pause, role changes, harvest failures, migration schedule). M3 is the production hardening of this surface.

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

## 5. Open questions

These are not implementation choices to guess. Each one should be answered in review of this draft, then recorded as an NDR when it constrains later work.

### 5.1 Upgrade authority, until frozen

The spec already decides the monetary core:

- NETH, Grave, and Reaper are immutable / not proxy-upgradeable (§10.1, §11, §21)
- no proxy can change monetary constants, issuance, or Reaper rules
- the only replaceable economic component is the strategy adapter, behind a 14-day timelock
- admin cannot withdraw principal, mint NETH, or retune eras/Reaper

“Upgrade authority until frozen” is therefore a contradiction if it means UUPS/transparent proxies (or an owner `upgradeTo`) on NETH, Grave, or Reaper, with a later freeze.

Options worth discussing:

| Option | Meaning | Spec impact |
|---|---|---|
| A | Mainnet monetary contracts immutable at deploy. “Freeze” means finish §18.3 config (Grave-only mint, admin moved off the deployer EOA onto multisig + timelock) and renounce any residual setup role | Matches the spec. Recommended default |
| B | Proxy-upgradeable monetary core, then a freeze/renounce after a bake-in | Contradicts §10.1, §11, §21, §22. Requires an NDR, a spec amendment, and a thorough review of key-compromise, audit surface, and launch-cost impact. Do not implement on the assumption this will be accepted |
| C | Sepolia (M1) may iterate by redeploying; mainnet (M2) stays Option A | Compatible with the spec. Useful if M1 is for integration only |

Nearby setup authority that is *not* monetary upgradeability, and is already in the spec:

- one-time mint-authority wiring from deployer to Grave
- strategy adapter replacement via timelock
- emergency pause/unpause of strategy-sensitive operations
- transferring admin from deployer to a multisig-capable account

If Option B is desired, stop and write the NDR before any proxy scaffolding lands in W0/W1.

### 5.2 “Reckoning”

Confirm whether this is only multi-era issuance accounting (W2), or also NAV/harvest (W4). This draft assumes the former.

### 5.3 Initial strategy

AAVE on Base is the stated MVP candidate, not an accepted decision. W5 starts with NDR-0002 (or next free number), not with adapter code.

### 5.4 Spec hygiene before Reaper

§8.3 / §10.1 / §17 still mention a Reaper minimum budget or “minimum-budget formula,” while §8.3 and §21 say there is none. Implementation should follow “no minimum; any positive available Reaper ETH.” A small clarifying NDR (and spec amendment) should land before W3 so agents do not reintroduce a threshold.

### 5.5 Frontend and indexer stack

Open. Spec §22 allows an implementation choice. Record the choice as an NDR when W7 starts.

### 5.6 Landing and dashboard

This draft keeps one frontend workstream with two surfaces. Split only if they should ship on different timelines (for example a static landing before the app).

### 5.7 Whether to freeze this sequence as an NDR

Once this draft is accepted, either leave it as a living plan or copy the accepted sequence into an NDR. The spec’s M0–M5 table should remain the milestone source of truth either way.

## 6. NDR queue implied by this draft

Do not open these until the question is actually being decided. Listed so work does not silently invent the answer.

| Topic | Needed before | Notes |
|---|---|---|
| Compiler / OZ / Foundry version freeze | M2 (can wait until late M0) | Spec §18.3 |
| Reaper minimum-budget wording cleanup | W3 | Spec inconsistency, not a new economic rule |
| Upgrade / freeze policy if it is anything other than Option A | W0/W1 | Option A needs no NDR; B does |
| `IStrategyAdapter` surface change, if any | W4 | Only if the spec interface is insufficient |
| Initial production strategy (AAVE candidate) | W5 | Required |
| Frontend framework and indexer | W7 | Spec leaves this open |
| Any Aerodrome/LP design | W9 | Must not touch v1 monetary contracts |

Routine mechanical work (typos, tests that restore documented behavior) does not need an NDR.

## 7. Suggested order and parallelism

```text
W0 scaffold
 └─ W1 NETH
     ├─ W2 Grave (era math → bury → idle ETH)
     │    └─ W4 strategy interface, harvest, timelock, pause, mock adapter
     │         └─ W5 production adapter (after NDR)
     └─ W3 Reaper (can overlap W2 once NETH exists)
            └─ W4 harvest credits Reaper; pause includes auction creation

M0 gate: W1–W5 tests, invariants, economic sim, Base fork tests
 ├─ W6 Sepolia deploy kit
 ├─ W7 frontend (can start after W2/W3 views exist)
 └─ W8 keeper + indexing (can start after harvest/auction exist)

M1: Sepolia + frontend
Audit + §22 artifacts
M2: mainnet (budget gate)
M3: W8 production hardening
M4: W9 optional
M5: further adapters
```

W3 should not wait for AAVE. W7 should not wait for W5. M2 should wait for W5, audit, and the cost script.

## 8. Explicit non-goals for v1

Do not add, even as “helpful” extras (spec §20): ETH redemption, NETH staking, leverage, peg, NETH lending, Reaper DEX swaps, NETH price oracle, discretionary monetary governance, team mint, transfer taxes, reflections, protocol-owned liquidity, mandatory DEX integration, cross-chain issuance, or multiple simultaneous adapters.

## 9. Acceptance of this draft

This draft is accepted when the open questions in §5 are either decided or explicitly deferred with an owner (NDR vs later discussion). Until then it is a proposal. Implementation agents must keep treating [`protocol_spec.md`](protocol_spec.md) §§1–21 as requirements and must not start W1+ from an unresolved Option B.
