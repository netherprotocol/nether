# NIP-0009: Grave Keeper (cranker)

- Status: Proposed
- Date: 2026-08-15
- Workstream: W8 (keeper slice; full §19 indexer still later)
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Frontend toolchain to reuse: Accepted [`NDR-0003`](../ndr/0003-frontend-stack.md) (TypeScript / Node / npm; not the Astro site)
- License: [`NDR-0004`](../ndr/0004-source-available-until-mainnet.md) (app tree: `"private": true`; no SPDX required beyond that unless a later docs change says otherwise)

This plan is the W8 Gravekeeper breakdown. It does not change era math, harvest rules, Reaper economics, or contract ABIs. The spec wins if anything below disagrees.

No NDR is opened for this slice. Stack, CLI shape, and crank policy are recorded here so implementation can start without a freeze record. A later NDR may pin versions if they must lock before M3.

## 1. Purpose

Ship a **cross-platform console cranker** that an operator runs against Base (and Sepolia). `harvest()`, `startAuction()`, and `finalizeAuction()` are already permissionless ([`NIP-0000`](0000-the-roadmap.md) W8, spec §7 / §8.3 / §8.7). The bot is an operator convenience, not a privileged role. Production keeper incentive is **zero**: gas is paid from the operator EOA, never from protected principal (spec §7).

The bot must:

- run as a console application on Linux, macOS, and Windows
- **view-check and simulate before every paid call**, so it does not send transactions that would revert or move dust that is not worth Base gas
- **log ETH spent on gas** (L2 execution plus OP-stack L1 data fee) so operators can see what it costs to support the protocol

It does not sell NETH to the Reaper, migrate strategies, or replace the dashboard.

## 2. Scope

In scope:

- Isolated `apps/keeper/` Node + TypeScript console app (own npm manifest; no root workspace)
- Crank loop: harvest when yield is realizable; finalize an expired auction; start an auction when startable ETH exists and none is active
- Conservative paid-call policy: views → simulate → estimate fee → economic floor → send
- Append-only gas ledger (JSONL) plus human console lines, including session and lifetime operator spend
- `once` (default) and `watch` modes; `--dry-run` never sends
- Unit tests of the decision engine with a tiny in-process RPC stub (no mocking library)
- Keeper CI workflow: typecheck and tests from `apps/keeper/`

Out of scope:

- Changing `Grave.sol`, `Reaper.sol`, NETH, adapters, or any ABI
- Indexer / The Graph / Ponder / a historical analytics database (still TBD; do not couple to [`NDR-0003`](../ndr/0003-frontend-stack.md))
- Full spec §19 dashboard (issuance-by-era charts, fill-rate history). Keeper-local alerts that fall out of the same views are in scope; a public Keepers page is a later W7/W8 UI NIP
- Keeper incentive from principal, tips, MEV bundles, or flashbots
- `sellToReaper`, `bury`, `collectSurplus` as a standalone tx, `scheduleStrategy` / `executeStrategyMigration` / `cancelScheduledStrategy`, ownership calls
- Docker-only or systemd-only packaging (docs may show examples; the app itself is `node dist/index.js`)
- KMS / hardware-wallet signing (v1 is `PRIVATE_KEY` from env)
- Sharing a package workspace with `apps/web/` (forbidden by [`NIP-0001`](0001-scaffolding.md))
- Accepting NDR-0002

Do not implement redemption, DEX routing, or a NETH oracle.

## 3. Architecture choices

These shapes are authorized for this slice. They do not change protocol money. Spec and accepted NDRs win if anything below disagrees.

### 3.1 Isolated TypeScript console app, not a second website

[`NIP-0001`](0001-scaffolding.md) already reserved `apps/keeper/` with its own runtime. [`NDR-0003`](../ndr/0003-frontend-stack.md) froze the **web** stack (Astro static HTML) and explicitly left Gravekeeper out of that freeze. Reuse the web toolchain majors (TypeScript, Node, npm, and `viem` for protocol reads) when they apply. Record stack, CLI shape, and crank policy in this NIP rather than an NDR.

| Shape | Why not |
|---|---|
| Go / Rust binary | New language, new CI, no reuse of the web TypeScript toolchain. |
| Python | Second app toolchain; [`NIP-0001`](0001-scaffolding.md) already expected JS/TS for `apps/web/`. |
| Deno / Bun | Not what `apps/web/` uses (Node 22 + npm). |
| HTTP service / worker platform | Not a console app; pulls toward a paid Node host the web NDR avoided. |
| Shell script wrapping `cast` | Not cross-platform (Windows), not unit-testable as a decision engine. |
| Astro island inside `apps/web/` | Mixes operator keys into the public static site. [`NIP-0001`](0001-scaffolding.md) forbids mixing keeper with web. |
| Node + TypeScript CLI under `apps/keeper/` (chosen) | Same language, Node major, package manager, and `viem` already named for protocol reads in NDR-0003. Own manifest. Runs as `node dist/index.js` on Linux, macOS, and Windows. |

Working set (not an NDR freeze; bump in this NIP if a patch is needed before implementation):

| Piece | Choice | Why |
|---|---|---|
| Runtime | Node `22` LTS | Same as [`NDR-0003`](../ndr/0003-frontend-stack.md) |
| Language | TypeScript `5.9.3`, `strict` | Same pin as `apps/web/`; `@astrojs/check` is **not** used here |
| Package manager | npm + `apps/keeper/package-lock.json` | No root `package.json`, no pnpm workspace ([`NIP-0001`](0001-scaffolding.md)) |
| Module | `"type": "module"`, `module`/`moduleResolution`: `NodeNext` | Matches web ESM; do not extend `astro/tsconfigs` |
| Chain I/O | `viem` `2.55.15` | Already the planned web live-read library (NDR-0003). Typed `simulateContract` / receipts / OP-stack `l1Fee` |
| CLI parse | `node:util` `parseArgs` | Stdlib, cross-platform, no extra CLI framework |
| Tests | `node:test` + `node:assert/strict` | Same as `apps/web/src/lib/docs.test.ts` |
| Build | `tsc` → `dist/`; run `node dist/index.js` | No Unix shebang dependency |

`viem` is a **keeper** dependency. Do not add it to `apps/web/` in this slice.

### 3.2 Decision engine separate from RPC

The crank policy must be unit-tested without a live Base node and without a mocking library.

```text
planTick(snapshot, fees, policy) → PlannedAction[]
```

`PlannedAction` is `finalize` | `harvest` | `start` | `skip` with a reason. A thin runner loads config, reads a snapshot, asks `planTick`, then (unless `--dry-run`) simulates, re-checks the fee floor, sends, and logs gas.

The RPC port used in tests is a hand-written stub with only the methods the runner needs (≤ the snapshot + simulate + estimate + send + receipt surface). Do not add Jest/Vitest/Mockito.

### 3.3 One action sequence per tick, never a bundled helper contract

[`NIP-0005`](0005-reaper.md) §4.3: do not auto-start the next auction inside `finalizeAuction`. Spec §18.2: no extra helper contracts.

| Shape | Why not |
|---|---|
| Multicall / keeper contract that harvest+start+finalize | Extra deploy, extra audit, extra launch gas, new trust surface. |
| One paid tx per process exit only | `watch` could not harvest then start after the harvest lands. |
| Sequential permissionless calls in one tick, each re-checked after the previous receipt (chosen) | Matches the on-chain split; still conservative because each send has its own view/sim/fee gate. |

Order inside a tick (see §5): **finalize → harvest → start**. Finalize unblocks start. Harvest credits `availableReaperETH` for start. Do not start before finalize if an expired auction is still `active`.

### 3.4 Operator-funded EOA, zero protocol tip

Spec §7 production default is zero keeper incentive. [`NIP-0006`](0006-strategy.md) shipped `harvest()` with no tip parameter.

Signing in this slice: `viem/accounts` `privateKeyToAccount` from `NETHER_PRIVATE_KEY` (or `--private-key`, discouraged). Never print the key. `.env` is already gitignored at repo root.

Insufficient operator ETH: skip the send, log a warning, do not retry in a tight loop.

## 4. Protocol facts the keeper must not reinvent

Read these from chain. Do not reimplement era math or the Reaper curve.

### 4.1 Views (multicall in one RPC round-trip)

From `Grave` ([`NIP-0004`](0004-grave.md), [`NIP-0006`](0006-strategy.md)):

```text
harvestableYield() → uint256
currentNAV() → uint256
protectedPrincipal() → uint256
activeStrategy() → address
reaper() → address
pendingStrategy() → (adapter, executeAfter)
```

From `Reaper` ([`NIP-0005`](0005-reaper.md)):

```text
availableReaperETH() → uint256
activeAuction() → Auction
```

Plus `eth_getBalance` of Reaper (and the operator EOA before a send).

`Auction` fields the keeper needs: `id`, `ethBudget`, `ethRemaining`, `startTime`, `endTime`, `active`.

If a Grave view reverts (`currentNAV` / `harvestableYield` when the adapter’s `totalAssetsInETH` reverts), treat harvest as **not callable**, log an alert (broken adapter / migrate), and still run Reaper finalize/start if those views succeed.

### 4.2 Surplus is startable, `collectSurplus` is not a keeper action

[`NIP-0005`](0005-reaper.md) §4.5: forced ETH may sit in `address(reaper).balance` without being in `availableReaperETH`. `startAuction` and `finalizeAuction` already call `_collectSurplus()`.

```text
allocated = availableReaperETH + (auction.active ? auction.ethRemaining : 0)
surplus   = max(0, reaper.balance - allocated)
startable = auction.active ? 0 : availableReaperETH + surplus
```

Do **not** send a standalone `collectSurplus()`: that is an extra paid tx for work `startAuction` / `finalizeAuction` already do. The start gate must use `startable`, not `availableReaperETH` alone.

### 4.3 `harvestableYield() > 0` is necessary, not sufficient

[`NIP-0006`](0006-strategy.md) §7: `harvest()` reverts `NoHarvestableYield` when the view is 0, and `ZeroHarvest` when reported yield cannot be realized as ETH (adapter withdraw pays nothing and there is no idle surplus). A paid `harvest()` that reverts wastes operator gas and does not help the protocol.

Always `simulateContract({ functionName: 'harvest' })` from the operator address. Use the simulated return (`ethHarvested`) as the size for the fee floor. If simulation reverts, skip.

### 4.4 Dust auctions are a caller decision

Spec §8.3: no protocol minimum budget; “extremely small auctions may be irrational after Base gas costs; callers decide.” Skipping a dust `startAuction` leaves ETH in `availableReaperETH` until more harvest arrives. That is allowed and is the conservative default.

Skipping harvest of dust leaves surplus as Grave backing until it is large enough to be worth realizing. Yield is not burned; Reaper funding is delayed. That is allowed.

**Finalize is not optional** when `active && now >= endTime`. An expired auction blocks the next start ([`NIP-0005`](0005-reaper.md) §4.3). The keeper always attempts finalize after simulation succeeds, even if `ethRemaining == 0`. Do not apply the dust floor to finalize.

## 5. Conservative paid-call policy

Default: **do not send** unless every gate passes. `--dry-run` stops after simulate + estimate.

### 5.1 Gates (all of them)

For each candidate action:

1. **View gate.** The snapshot says the call is eligible (§5.2).
2. **Simulate gate.** `eth_call` / `simulateContract` of that function from the operator succeeds.
3. **Fee estimate.** `estimateGas` plus the OP-stack L1 data fee. On Base, `gasUsed * effectiveGasPrice` alone understates cost; include receipt `l1Fee` after send, and include an L1 fee estimate before send (`viem` OP-stack estimate / `estimateL1Fee` as applicable). If L1 estimate is unavailable, pad L2 `maxFeePerGas * gas` with a configurable multiplier rather than pretending L1 is zero.
4. **Economic floor** (harvest and start only; not finalize):

```text
feeWei     = estimated total operator cost for this tx
minSizeWei = harvest ? policy.minHarvestWei : policy.minAuctionWei
sizeWei    = simulated ethHarvested   // harvest
           | startable                // start
skip if sizeWei < max(minSizeWei, feeWei * policy.minSizeToFee)
```

Defaults:

| Policy | Default | Meaning |
|---|---|---|
| `minSizeToFee` | `1` | Skip if protocol ETH moved / auctioned is smaller than estimated operator fee |
| `minHarvestWei` | `0` | No extra absolute floor beyond the fee comparison |
| `minAuctionWei` | `0` | Same; operator may raise it |
| `minSizeToFee` for finalize | n/a | Always send if view+sim pass |

Operators who want to crank 1-wei auctions (legal on-chain) set `--min-size-to-fee 0` and `--min-auction-wei 0`.

5. **Operator balance.** Skip if EOA balance < fee + a small wei pad.
6. **Chain ID.** Abort the process at startup if `eth_chainId` ≠ configured chain (8453 Base, 84532 Base Sepolia). Do not send on the wrong network.
7. **Lost race.** If the send reverts with an expected cranker error (`NoHarvestableYield`, `ZeroHarvest`, `AuctionActive`, `ZeroValue`, `NoActiveAuction`, `AuctionNotExpired`, `ReaperNotSet`, …), log skip and continue. Do not retry that action in the same tick.

### 5.2 Eligibility from the snapshot

```text
shouldFinalize  = auction.active && now >= auction.endTime

shouldHarvest   = harvestableYield > 0
                  && reaper is set (harvest() would not revert ReaperNotSet)
                  && currentNAV >= protectedPrincipal   // else harvestable is 0 anyway; alert

shouldStart     = !auction.active && startable > 0
                  && (if shouldFinalize was true this tick, wait until finalize receipt)
```

`now` is the block timestamp from the snapshot’s block (not the operator laptop clock) so `watch` does not finalize early.

### 5.3 Tick algorithm

```text
snapshot = readViews()          // one multicall + two balances
emitAlerts(snapshot)            // NAV < principal, pending strategy, view revert

if shouldFinalize(snapshot):
    trySend(finalizeAuction)

    snapshot = readViews()      // required; start/harvest gates must see active=false

if shouldHarvest(snapshot):
    trySend(harvest)
    snapshot = readViews()      // start must see new availableReaperETH / surplus

if shouldStart(snapshot):
    trySend(startAuction)
```

`trySend` is gates 2–7. `--dry-run` runs gates 1–4 and logs `would_send` without `eth_sendRawTransaction`.

`once` runs one tick and exits 0 even if every action skipped (skipping is success). Exit non-zero on config error, wrong chain, or an unexpected runner crash. Expected on-chain reverts are skips.

`watch` loops ticks until SIGINT/SIGTERM (both, so Windows Ctrl+C and Unix stop work). After a tick whose only remaining work is `shouldFinalize` at `endTime` in the future, **sleep until `endTime` (plus one block slack)**, capped by `--poll-ms`. Do not busy-poll every Base block. Default `--poll-ms 60000`.

### 5.4 What the keeper must never send

- `sellToReaper` (sellers do this)
- `bury`
- `collectSurplus` as its own transaction
- any `onlyOwner` function
- approval / NETH transfer
- adapter `depositETH` / `withdrawETH` (only Grave may)

## 6. Gas accounting

The point of the ledger is to answer: **how much ETH has this operator spent supporting harvest and Reaper cranking?**

### 6.1 Per-transaction record (JSONL, one object per line)

Append after a receipt (or after a dry-run estimate, with `"sent": false`):

```text
ts                ISO-8601 UTC
chainId
action            harvest | startAuction | finalizeAuction
sent              boolean
tx                0x… or null
blockNumber       or null
gasUsed
effectiveGasPrice
l1Fee             0 if the receipt has none
feeWei            gasUsed * effectiveGasPrice + l1Fee   // or estimate when dry-run
sessionFeeWei     sum of sent feeWei since process start
lifetimeFeeWei    sum of sent feeWei in the ledger file
detail            action-specific (see below)
skipReason        present when sent=false and no dry-run estimate (view/sim/floor)
```

`detail` by action (from return values / logs / snapshot):

| Action | `detail` |
|---|---|
| harvest | `ethHarvested` |
| startAuction | `auctionId`, `ethBudget` |
| finalizeAuction | `auctionId`, `ethRolledOver`, `ethSpent`, `nethBurned` |

Decode `YieldHarvested` / `ReapingStarted` / `ReapingFinalized` when a receipt exists. If a log is missing, still keep `feeWei`.

### 6.2 Files and console

- Ledger path: `--gas-log` / `NETHER_GAS_LOG` (default `./keeper-gas.jsonl` under cwd). Create if missing; append only; do not rewrite history.
- Lifetime total: sum of `feeWei` where `sent=true` in that file (recompute on start; do not trust a cached sidecar).
- Console (stderr for skips/errors, stdout for sends): one human line per action, including `feeWei` and the running session total.
- Never log private keys, RPC URLs with embedded credentials, or full signed raw tx bytes.

Cross-platform paths: `node:path` / `node:fs`. Do not call `bash`, `mkdir -p` via shell, or write `/tmp/...` as a default.

## 7. Console surface

Package name: `nether-keeper` (`"private": true`), analogous to `nether-web`.

```text
node dist/index.js once     # default argv if omitted: once
node dist/index.js watch
node dist/index.js --help
```

| Flag | Env | Required | Notes |
|---|---|---|---|
| `--rpc-url` | `NETHER_RPC_URL` | yes | HTTP(S) only in this slice |
| `--chain-id` | `NETHER_CHAIN_ID` | yes | `8453` or `84532` (or the matching `viem/chains` name as a convenience) |
| `--grave` | `NETHER_GRAVE` | yes | checksummed address |
| `--reaper` | `NETHER_REAPER` | yes | checksummed; abort at startup if `Grave.reaper()` is set and differs |
| `--private-key` | `NETHER_PRIVATE_KEY` | yes except `--dry-run` | hex key; env preferred |
| `--dry-run` | | no | views + sim + estimate; no send; key optional |
| `--poll-ms` | `NETHER_POLL_MS` | no | default `60000`; `watch` only |
| `--min-harvest-wei` | `NETHER_MIN_HARVEST_WEI` | no | default `0` |
| `--min-auction-wei` | `NETHER_MIN_AUCTION_WEI` | no | default `0` |
| `--min-size-to-fee` | `NETHER_MIN_SIZE_TO_FEE` | no | default `1` (integer; `0` disables the fee comparison) |
| `--gas-log` | `NETHER_GAS_LOG` | no | default `keeper-gas.jsonl` |

Ship `apps/keeper/.env.example` with the names above and empty values. Do not ship a real key.

Help text must say the keeper is permissionless, pays its own gas, and will skip dust harvests/auctions by default.

Addresses are not baked in until W6 deploy artifacts exist. This slice takes them as config.

## 8. Tree

Follow [`NIP-0001`](0001-scaffolding.md). Do not add a root `package.json`. Do not import from `apps/web/src`.

Hand-write the tiny ABI fragments the keeper needs (`parseAbi` / `const` abi). Do not generate from `contracts/out` at CI time (that would mix Foundry into the keeper workflow). When W7 later adds `viem` islands, it may copy the same fragments; a shared package would need a workspace NDR.

```
apps/keeper/
├── package.json
├── package-lock.json
├── tsconfig.json
├── .env.example
├── README.md
└── src/
    ├── index.ts                 parseArgs, load config, once | watch
    ├── config.ts
    ├── abi.ts                   Grave + Reaper fragments only
    ├── snapshot.ts              multicall + balances → Snapshot
    ├── plan.ts                  planTick (pure)
    ├── crank.ts                 trySend gates, sequential tick
    ├── gasLog.ts                JSONL append + lifetime sum
    ├── alerts.ts                NAV < principal, view failure, pending strategy
    └── *.test.ts                node:test
```

Suggested npm scripts (names may match; keep them runnable from `apps/keeper/`):

```text
build   tsc
start   node dist/index.js
check   tsc --noEmit
test    tsc && node --test dist/**/*.test.js
```

Do not add React, Astro, Tailwind, or wallet-connect kits.

## 9. Alerts (keeper-local, not an indexer)

Spec §19 monitoring that this process can see without an event database:

| Condition | Action |
|---|---|
| `currentNAV < protectedPrincipal` | log alert every tick; do not harvest |
| Grave NAV/harvestable view reverts | log alert; skip harvest |
| harvest/start/finalize simulation revert that is **not** an expected empty-crank error | log alert |
| `pendingStrategy.adapter != 0` | log notice with `executeAfter` (do not execute; admin-only) |
| `activeStrategy` changed vs the previous tick’s snapshot | log notice |
| operator balance below a warning wei threshold (e.g. 10× last fee) | log warning |

Do not page Slack/PagerDuty in this slice (stdout/stderr + JSONL only). Do not emit `EmergencyPause` handling as a Grave call: v1 Grave has no pause ([`NDR-0005`](../ndr/0005-strategy-security.md)).

## 10. Tests

No live RPC in default CI. No Foundry. No mocking library.

### 10.1 `plan.ts` (pure)

Fixture snapshots covering:

- harvestable 0 → no harvest
- harvestable > 0 but `sizeWei < feeWei * minSizeToFee` → skip harvest with reason `below_fee_floor`
- harvestable dust vs `minHarvestWei`
- `active && now < endTime` → no finalize, no start
- `active && now >= endTime` → finalize only (start waits for a post-finalize snapshot)
- `!active && startable == 0` → no start (including surplus 0)
- `!active && availableReaperETH == 0 && surplus > 0` → start eligible (surplus counts)
- `!active && startable > 0` but below auction fee floor → skip start
- finalize has no fee floor even when `ethRemaining == 0`
- `currentNAV < protectedPrincipal` → no harvest
- lost-race style: planner still proposes harvest; crank tests assert a simulated revert becomes skip, not throw

### 10.2 `crank.ts` with an in-process stub

Stub implements: snapshot, simulate (ok or revert), estimateFee, send (returns a receipt with `gasUsed` / `effectiveGasPrice` / `l1Fee`). Assert:

- dry-run never calls send
- failed simulation never calls send
- after a finalize send, harvest/start see the refreshed snapshot (stub can mutate)
- `feeWei` in the ledger equals `gasUsed * effectiveGasPrice + l1Fee`
- lifetime total grows only when `sent=true`
- expected revert on send is skip

### 10.3 `config.ts`

- missing RPC / addresses / chain id → throw
- `--dry-run` without a key is allowed
- paths with mixed `\` / `/` still open the gas log via `node:path`

Do not require `BASE_RPC_URL` (that is the contracts fork secret). Keeper tests are offline.

## 11. CI

Add `.github/workflows/keeper.yml`, separate from `contracts.yml` and `web.yml`:

- `pull_request`, `push` to `master`, `workflow_dispatch`
- Node `22`, `cache-dependency-path: apps/keeper/package-lock.json`
- `working-directory: apps/keeper`
- `npm ci`, `npm run check`, `npm test`

Do not run `forge` or `astro` from this workflow. Do not deploy the keeper.

## 12. Implementation steps

Do not run these until this NIP is explicitly started.

1. Replace the `apps/keeper/` stub README with the console-app layout in §8. npm at the working versions in §3.1.
2. ABI fragments for the views and the three permissionless writes only.
3. Pure `planTick` + tests in §10.1.
4. Snapshot multicall + surplus math in §4.2.
5. `trySend` gates, gas JSONL, `once` / `watch` / `--dry-run`.
6. `.env.example` and a short README: install Node 22, `npm ci`, `npm run build`, `node dist/index.js once`.
7. `keeper.yml`.
8. Do not change Solidity, `apps/web/`, or NDR files.

## 13. Acceptance criteria

This slice is done when:

- `apps/keeper` is a Node 22 + TypeScript 5.9.3 + viem console app with its own lockfile
- `once` and `watch` run on Linux, macOS, and Windows via `node dist/index.js` (no POSIX-only scripts required)
- a tick never sends `harvest` / `startAuction` / `finalizeAuction` without a passing view gate and a passing simulation
- harvest and start are skipped when simulated size is below the fee floor; finalize of an expired auction is not skipped for dust
- standalone `collectSurplus`, `sellToReaper`, and admin functions are absent
- every sent tx appends a JSONL record whose `feeWei` includes OP-stack `l1Fee` when present, and the console prints running operator spend
- `--dry-run` performs no `eth_sendRawTransaction`
- `npm run check` and `npm test` pass offline from `apps/keeper/`
- no NDR was required for this plan; NDR-0002 remains Proposed unless accepted elsewhere

## 14. Not decided here

Leave these to later NIPs / NDRs:

- Indexer technology for spec §19 historical series (still TBD; queued in [`NIP-0000`](0000-the-roadmap.md))
- Public Keepers / dashboard UI ([`NIP-0002`](0002-landing-docs.md) reserved the header slot)
- W6 baked-in Sepolia/mainnet addresses and deploy scripts
- RPC vendor / fallback provider
- KMS or remote-signer
- Accepting NDR-0002
- A keeper version-freeze NDR, if M3 needs one
- Changing `minSizeToFee` defaults after measured Base fees (edit this living NIP; not a protocol change)

No new protocol surface is introduced. The three calls already exist ([`NIP-0005`](0005-reaper.md), [`NIP-0006`](0006-strategy.md)). Isolation under `apps/keeper/` is [`NIP-0001`](0001-scaffolding.md). TypeScript/Node/npm/viem reuse [`NDR-0003`](../ndr/0003-frontend-stack.md)’s web toolchain without extending that NDR’s freeze to Gravekeeper. Zero incentive is spec §7. Dust skip is spec §8.3 caller discretion. Gas logging is operator observability for W8, not a monetary rule.
