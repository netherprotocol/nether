# NIP-0010: Grave dashboard (monitoring slice)

- Status: Implemented
- Date: 2026-08-15
- Workstream: W7 (app / monitoring slice)
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md) §12, §14
- Stack: Accepted [`NDR-0003`](../ndr/0003-frontend-stack.md)
- Prior slice: [`NIP-0002`](0002-landing-docs.md) (holder + docs)
- Visual reference: attached **The SOL Grave** dashboard screenshot, with the Nether-specific exceptions in §4
- No NDR in this slice

This plan is the second public frontend slice: a live Grave / Reaper / NETH monitoring page on the existing Astro static site. It reads spec §12 views from Base Sepolia. It does **not** send `bury`, `sellToReaper`, or wallet transactions. Those stay stubs for a later W7 NIP.


## 1. Purpose

Ship the public dashboard so anyone can observe the Sepolia family without connecting a wallet:

- live era, burial, NAV, harvestable yield, strategy, and Reaper auction state from chain
- screenshot-faithful layout on the existing Nether chrome
- a network switch that is ready for Base mainnet but only Sepolia is enabled
- a sticky public RPC pool with failover and a full-page RPC-down state

Unblock a later wallet / bury / sell NIP on the same route without rewriting the page.

## 2. Scope

In scope:

- New route `/grave` (with `base: /nether/` → `/nether/grave`)
- Unlock **Enter the Grave** on the holder and in the header so it navigates to `/grave`
- Client island that reads spec §12 views (plus a few supporting getters already on the contracts) via `viem`
- Screenshot layout: top stats, GRAVE, REAPER, $NETH — **without** the `1.` / `2.` / `3.` prefixes
- Network switch: Base mainnet (product default, **disabled**) and Base Sepolia (**enabled**, current live target)
- Canonical Sepolia deployment JSON under `contracts/deployments/base-sepolia.json` (addresses from the 2026-08-15 Sepolia family)
- Ordered public RPC pool for Base Sepolia; sticky-until-fail rotation; RPC-unavailable screen
- Stub bury / sell / connect-wallet controls (visible, non-functional)
- Read-only quotes: `quoteBury` / `quoteReaperSale` still run as view calls when the user types an amount
- Lucide icons only (`@lucide/astro` already in tree; `lucide-react` in the island)
- Unit tests for the RPC pool and formatting helpers; web CI still typechecks and builds

Out of scope:

- Wallet connect, `wagmi`, injected providers, transaction prompts
- Sending `bury()`, `sellToReaper()`, approvals, or any other state-changing call
- Base mainnet addresses, mainnet RPC pool use, or enabling the mainnet switch
- Indexer, The Graph, Ponder, historical charts, Keepers page
- Market cap, DEX price, Reaper Ratio (no external market in v1; spec §14 says only where market data exists)
- Custom domain, SSR, a second frontend app
- Changing protocol copy in `docs/protocol_spec.md`
- A new NDR (NDR-0003 already allows React islands + `viem` while output stays `static`)

Do not implement redemption, a peg, or Reaper-pays-holders copy.

## 3. Information architecture

| Route | Role |
|---|---|
| `/` | Holder (existing). Primary CTA becomes a real link to `/grave`. |
| `/docs` | Documentation (unchanged). |
| `/grave` | Dashboard. Live reads + stub actions. |

Header after this slice:

- **Nether** (left, serif) → `/`
- **DOCS** · **SOURCE** (center, existing)
- **Enter the Grave** (right) → `/grave` (no longer `aria-disabled`)

Do not add GRAVE / KEEPERS / CONNECT to the center nav. Network switching lives in the $NETH section, not the header.

Remove `GRAVE_LOCKED_HINT` once the CTA is a link. Do not keep a “not dug yet” tooltip on a working route.

## 4. Visual spec

Source of truth for look: the attached dashboard screenshot. Source of truth for numbers, labels that imply protocol rules, and missing fields: spec §12 / §14 and the live contracts.

Copy layout, type, color, and chrome from the screenshot. Do not copy SOL Grave economics or mock figures.

### 4.1 Chrome and type

Reuse the holder/docs tokens in `apps/web/src/styles/global.css`:

- Field: near-black (`#000` / `#0b0b0b` cards)
- Accent: existing `--color-accent` (`#a05a40`)
- Paper text: `--color-paper`
- Display: Cormorant Garamond; UI: Inter
- Cards: rounded boxes, thin low-opacity borders, no extra illustration

Dashboard background: same family as docs (`site-glow`), not the holder’s cropped hero. The page scrolls; it is not locked to `100svh`.

### 4.2 Icons (Lucide only)

Do not invent, generate, or hand-draw marks. Use Lucide:

| Use | Lucide icon |
|---|---|
| Total ETH buried | `Landmark` (already used for The Grave on the holder) |
| $NETH / gem | `Gem` |
| Current era | `Hourglass` |
| Reaper / auction | `Skull` |
| Explorer link | `ExternalLink` |
| Quote / rate info | `Info` |
| Amount arrow / chevrons | `ChevronDown` / `ArrowDown` |
| Network (no Base logo asset) | `Globe` plus the word **Base** / **Base Sepolia**. Optional 8px disc in Base brand blue `#0052FF` as a CSS color, not a drawn logo. |

Do not add a second icon pack. Do not paste a traced Base logo.

### 4.3 Top stats bar

Four equal cards:

| Card | Source |
|---|---|
| Total ETH buried | `Grave.protectedPrincipal()` (cumulative buried ETH; spec §14) |
| $NETH total supply | `NETH.totalSupply()` (circulating, post-burn) |
| Current era | `Grave.currentEra()` |
| Reaper status | `Reaper.activeAuction().active` → **Auction active** (green dot) or **Inactive** |

### 4.4 GRAVE (no leading number)

Title: **GRAVE**. Subtitle: **Bury ETH to earn $NETH**.

Left column (live):

| Row | Source / rule |
|---|---|
| Total ETH buried | `protectedPrincipal()` |
| Bury quote | `quoteBury(1 ether)` formatted `1 ETH → {neth} NETH`, with an info tooltip |
| Current era | `currentEra()` |
| Era progress | `currentEraBuried / currentEraCapacity` as a percent bar |
| ETH remaining in era | `currentEraCapacity - currentEraBuried` — **not** a wall-clock countdown. Nether eras fill by buried ETH (spec §5, §14). The screenshot’s “Era ends in 1d 04h” is SOL Grave time-era chrome and must not be copied. |
| Harvestable yield | `harvestableYield()` |
| Strategy NAV | `currentNAV()` (required by spec §14; add this row even though the screenshot omitted it) |
| Active strategy | `activeStrategy()`, truncated, Basescan link |
| Pending strategy | `pendingStrategy()`; if `adapter != 0`, show **Pending**, truncated address, and `Activates in {d h m}` from `executeAfter`. If none, omit the row. |
| Grave contract | deployment JSON address, Basescan link |

Right column: stub **Bury** widget (screenshot layout).

- “You bury” ETH amount input (local state). Balance line: **Balance: —** (no wallet).
- “You receive” estimated NETH from `quoteBury(amount)` when amount > 0; otherwise `0.0` / estimated.
- Rate line repeats the 1 ETH quote.
- Full-width **BURY ETH** button: visible, `disabled`, tooltip: wallet bury ships in a later NIP.
- Permanent-burial warning from spec §14 next to the button (required copy, even while the button is a stub):

> Buried ETH is permanent. You cannot withdraw it. In exchange, the protocol mints NETH according to the current era. The Grave deploys its capital to earn yield, and harvestable yield funds the Reaper.

If a typed bury would cross an era boundary, show a short breakdown (ETH in this era vs next, NETH from each). That is spec §14, not extra product copy.

Token selectors in the stub are display-only (ETH in, NETH out). They are not a menu of other assets.

### 4.5 REAPER (no leading number)

Title: **REAPER**. Subtitle: **Sell $NETH for ETH via reverse Dutch auction**.

Two columns in the product UI (the screenshot’s third “WHEN INACTIVE” column is a mockup of the empty state, not a permanent third pane):

**Left — auction info (always):**

- Status: **AUCTION ACTIVE** + green dot, or **INACTIVE**
- When active: large accent rate as `1 NETH → {eth} ETH` (sell direction, matching the screenshot). Info tooltip also states spec units: current NETH required per ETH (`currentReaperRate()`), start `2.00 R` / end `1.05 R`, 7-day linear reverse Dutch auction
- Auction ETH remaining / budget: `activeAuction().ethRemaining` and `ethBudget`
- Time remaining: `endTime - now`, formatted `Xd Xh Xm` (spec §14)
- When inactive: `availableReaperETH()` as idle budget waiting for `startAuction()`
- Total NETH reaped: `totalNethReaped()`
- Realized yield sent to Reaper: `totalHarvestedETH()` (spec §14 Grave dashboard item; place it here because the value lives on Reaper)
- Reaper contract address + Basescan link
- Spec warning when an auction is active: waiting may improve the rate but the budget can be consumed by others

**Right — action or empty:**

- Active: stub sell widget (You sell NETH / You receive ETH estimated via `quoteReaperSale`, **SELL NETH** disabled)
- Inactive: skull + **No active auction. Check back when a new auction begins.**

Balance line: **Balance: —**.

### 4.6 $NETH (no leading number)

Single row:

- Title: **$NETH**. Subtitle: **ERC-20 token on Base**
- **Network** control (§5)
- Total supply: `NETH.totalSupply()`
- Contract address: deployment JSON, Basescan link
- **CONTRACT DETAILS** disclosure (chevron). Expanded body: name `Nether`, symbol `NETH`, 18 decimals, Grave / Reaper / adapter addresses, chain id. No extra marketing.

## 5. Network switch

Two networks, one selected:

| Network | Chain id | Explorer | Enabled in this slice | Role |
|---|---|---|---|---|
| Base | 8453 | https://basescan.org | **No** | Product default for later mainnet. Visible, not selectable. |
| Base Sepolia | 84532 | https://sepolia.basescan.org | **Yes** | Only live target. Selected on load. |

Behavior:

- Control sits in the $NETH **Network** slot (segmented control, not a free-text dropdown).
- Base is rendered as the default network of the protocol and is `disabled` / `aria-disabled`, with a short reason: mainnet deployment is not live.
- Base Sepolia is the only enabled option. Initial selection is Sepolia. Do not leave the UI on a disabled network.
- Persist the enabled selection in `localStorage` under a namespaced key (e.g. `nether.network`) so a later slice can honor a mainnet choice without a redesign.
- All explorer links, RPC pool, and deployment addresses follow the selected network.
- Enabling mainnet later is a follow-up: add `contracts/deployments/base.json`, a mainnet RPC pool, and flip `enabled: true`. No new NDR for that if this switch shape stays.

## 6. Deployment data

Canonical file: `contracts/deployments/base-sepolia.json`, schema already described in [`contracts/deployments/README.md`](../../contracts/deployments/README.md).

Commit the Sepolia family the user supplied (verified on-chain: Grave / NETH / Reaper / adapter all have bytecode at these addresses; `currentEra()` returns `0` as of this plan):

```json
{
  "aave": {
    "aWeth": "0x73a5bB60b0B0fc35710DDc0ea9c407031E31Bdbb",
    "pool": "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
    "provider": "0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00",
    "variableDebtWeth": "0x562abf6562d6A2b165aDa02b5946bc3E7b4dD653",
    "weth": "0x4200000000000000000000000000000000000006"
  },
  "chainId": 84532,
  "contracts": {
    "adapter": "0xc47606cF64Bf2B1Ab555CeE30e123Ba1a26eB0b5",
    "grave": "0x21B7B051C85dc071CdA072Ec71D7c1b85cDc4De6",
    "neth": "0x8AC12cf1806391572D8Cb39B278F49dE317B9F73",
    "reaper": "0xEF26e160d6d93496dfdAD54b562C3C02dBD722c5"
  },
  "createdAt": 1786824966,
  "deployer": "0xB96996F7E61099FCEF71C10D7D801ac8b9584fB6",
  "graveOwner": "0xB96996F7E61099FCEF71C10D7D801ac8b9584fB6",
  "graveSetter": "0xB96996F7E61099FCEF71C10D7D801ac8b9584fB6",
  "network": "base-sepolia",
  "ownershipRecipient": "0x0000000000000000000000000000000000000000",
  "schemaVersion": 1,
  "status": "complete",
  "steps": {
    "acceptOwnership": false,
    "adapter": true,
    "executeStrategy": true,
    "grave": true,
    "neth": true,
    "postChecks": true,
    "reaper": true,
    "scheduleStrategy": true,
    "setGrave": true,
    "setReaper": true,
    "transferOwnership": false
  },
  "strategy": {
    "executeAfter": 1788034566
  },
  "updatedAt": 1786824966
}
```

The web tree does not own a second address book. At build time, import `../../contracts/deployments/base-sepolia.json` (Astro already allows `fs` to the repo root for docs). Typed network config in `apps/web/src/lib/` wraps that JSON: chain id, explorer origin, RPC pool, enabled flag.

Do not fetch GitHub for addresses at runtime.

## 7. Live reads

NDR-0003: live numbers come from RPC + spec §12 views, not an indexer. Add `viem` `2.55.15` to `apps/web/` (same pin as [`NIP-0009`](0009-grave-keeper.md)). Hand-write ABI fragments; do not generate from `contracts/out` in the web workflow.

### 7.1 Island

Use `@astrojs/react` (explicitly allowed by NDR-0003 while `output` stays `static`) with `client:load` on `/grave` only. Holder and docs stay zero-JS except existing hover tips.

Pin `@astrojs/react` and `react` / `react-dom` to the current pair compatible with Astro `7.2.2` at implementation time. `lucide-react` for icons inside the island; `@lucide/astro` remains for static pages.

### 7.2 Views to load (one snapshot)

Grave:

- `currentEra`, `currentEraBuried`, `currentEraCapacity`, `currentRewardRate`
- `quoteBury(uint256)`
- `protectedPrincipal`, `currentNAV`, `harvestableYield`
- `activeStrategy`, `pendingStrategy`

NETH:

- `totalSupply`

Reaper:

- `availableReaperETH`, `activeAuction`, `currentReaperRate`
- `quoteReaperSale(uint256)` when the sell input is > 0
- `totalNethReaped`, `totalHarvestedETH`

Use Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11` on Base and Base Sepolia) so one HTTP round-trip loads the snapshot. Quotes for user-typed amounts may be extra calls.

Poll ~12s while the tab is visible; pause when `document.hidden`.

Format ETH / NETH with grouping and a small number of fraction digits (trim trailing zeros). Truncate addresses `0xAbCd…1234`.

### 7.3 Loading and chain errors (not RPC-down)

First paint: skeleton / em-dash values inside the dashboard chrome, not a blank page.

If the RPC pool is healthy but a contract call reverts or returns nonsense (wrong chain id, empty bytecode at Grave), show an inline error in the dashboard: the selected network’s contracts could not be read. That is distinct from §8.3 (all RPCs unreachable).

## 8. RPC pool

Public, no API key, browser-CORS, `eth_chainId` = `0x14a34` (84532). Probed on 2026-08-15 with `Origin: https://rastsislaux.github.io`.

### 8.1 Sepolia pool (ordered)

| Order | URL | Notes |
|---|:---|---|
| 1 | `https://sepolia.base.org` | Official Base public endpoint. CORS `*`. |
| 2 | `https://base-sepolia-rpc.publicnode.com` | PublicNode. CORS `*`. |
| 3 | `https://base-sepolia.drpc.org` | dRPC. CORS reflects origin. |
| 4 | `https://base-sepolia.gateway.tenderly.co` | Tenderly public gateway. CORS `*`. |
| 5 | `https://84532.rpc.thirdweb.com` | thirdweb public. CORS `*`. |

All five returned `currentEra() == 0` for the Sepolia Grave in the same probe.

Tried and **rejected** (do not ship): Blast (service gone), 1rpc `unknown network`, BlockPI 521, OnFinality 401, Ankr 403 without key, Alchemy demo 429, LlamaRPC / TheRPC connect fail, Omniatech 521.

Mainnet pool is **not** used in this slice. When mainnet is enabled later, gather and probe the same way; do not copy the Sepolia URLs with a different host guess.

### 8.2 Sticky-until-fail rotation

One transport wrapper around the ordered list:

1. Remember `stickyIndex` (start at 0). Keep it in memory for the tab; also `sessionStorage` so a refresh does not immediately re-hit a just-failed host.
2. Send the request to `pool[stickyIndex]`.
3. Failure = network error, HTTP 4xx/5xx, timeout (~8s), JSON-RPC error, or `eth_chainId` not equal to the selected chain.
4. On failure, try the next URL, then the next, wrapping once. Do not retry a URL that already failed in this attempt.
5. The first success becomes the new `stickyIndex`. Later polls use it first.
6. If every URL fails, enter the RPC-unavailable state. Do not spin forever.
7. A **Retry** control on that screen starts the rotation from index 0 (or from the last sticky, then the rest — either is fine if documented in code; prefer restarting at 0 after a full outage).

A failed snapshot (multicall or the wrapping `eth_chainId` check) rotates. Do not rotate on a single user-typed `quoteBury` timeout if the previous snapshot succeeded; retry that quote once on the sticky RPC, then rotate.

### 8.3 RPC-unavailable screen

Replace the dashboard body (keep the site header) with:

- Heading: **{network name} RPC is currently unavailable.**
  - Sepolia: **Base Sepolia RPC is currently unavailable.**
  - Later mainnet: **Base RPC is currently unavailable.**
- Body: public RPC endpoints for this network did not respond. You can inspect the contracts on the matching Basescan, or wait until the Nether team resolves the issue.
- Links: Grave, NETH, Reaper (and adapter) on `sepolia.basescan.org` when Sepolia is selected; `basescan.org` when mainnet is selected.
- **Retry** button.

Do not send the user to a random third-party RPC UI. Do not silently fall back to cached fake numbers.

## 9. Stub actions

Visible, screenshot-faithful, inert:

| Control | This slice |
|---|---|
| Connect wallet | Not in the screenshot; do **not** add a header CONNECT. |
| ETH / NETH balances | **Balance: —** |
| Bury amount input | Local state; drives `quoteBury` |
| **BURY ETH** | `disabled`; not a submit |
| Sell amount input | Local state; drives `quoteReaperSale` when an auction is active |
| **SELL NETH** | `disabled`; not a submit |
| Token dropdowns | Static labels, not menus |

Do not install wallet libraries. Do not request accounts. Do not build a fake confirmation modal that looks like a real bury.

## 10. Tree

```
contracts/deployments/base-sepolia.json     canonical Sepolia family

apps/web/
├── package.json                            add viem, @astrojs/react, react, lucide-react; test script
├── astro.config.ts                         react() integration
├── src/pages/grave.astro                   dashboard route
├── src/components/
│   ├── Header.astro                        CTA → /grave
│   └── dashboard/                          React island + presentational pieces
├── src/lib/
│   ├── networks.ts                         chain config, explorers, enabled flags
│   ├── deployments.ts                      typed import of the JSON
│   ├── abi.ts                              view fragments
│   ├── rpcPool.ts                          sticky failover
│   ├── protocol.ts                         snapshot + formatters
│   └── rpcPool.test.ts                     in-process stub RPC (no mocking library)
└── ...
```

No root `package.json`. No shared workspace with `apps/keeper/`. Copying ABI fragments that already exist in the keeper is allowed; a shared package would need a workspace NDR.

## 11. Tests and CI

Add `apps/web` unit tests with `node:test` (same style as `docs.test.ts` and the keeper):

- RPC pool: first URL success stays sticky; first URL fail then second success sticks on the second; all fail surfaces the outage; chain-id mismatch counts as failure
- Formatters: wei → ETH/NETH strings, address truncate, duration `2d 14h 21m`, era remaining ETH, progress percent
- Network config: Sepolia enabled, Base disabled, explorer origin follows selection

Do not require a live RPC in CI. Stub HTTP/JSON-RPC in process; no Mockito-style mock library.

`.github/workflows/web.yml` PR job: `npm ci`, `npm test`, `npm run build`.

## 12. Implementation steps

Do not run these until this NIP is explicitly started.

1. Add `contracts/deployments/base-sepolia.json` with the §6 payload.
2. Add `viem` `2.55.15`, `@astrojs/react` (Astro 7-compatible), `react` / `react-dom`, `lucide-react`; keep Astro / Tailwind / TypeScript pins from NDR-0003.
3. Typed network + deployment + ABI modules; RPC pool with tests.
4. `/grave` page chrome (Astro) + React island for live state.
5. Map §4 fields to the snapshot; skeletons; RPC-unavailable screen; stub bury/sell.
6. Unlock header/hero CTA to `/grave`; drop the locked tooltip.
7. Network switch in $NETH as specified.
8. Wire web CI tests; `npm run build` still emits static HTML for `/` and `/docs`.

## 13. Acceptance criteria

This slice is done when:

- `/grave` matches the screenshot layout (dark cards, accent, four top stats, GRAVE / REAPER / $NETH **without numbers**) using Lucide icons only
- Numbers on Sepolia come from the §6 contracts via the §8 pool, not from mock copy
- “ETH remaining in era” is capacity remaining, not a fake era timer
- Base mainnet is visible in the switch and disabled; Sepolia is selected and live
- Bury / sell buttons are visible and do not send transactions or open a wallet
- Killing / blocking every pooled RPC shows **Base Sepolia RPC is currently unavailable** with Sepolia Basescan links and a retry control
- Holder **Enter the Grave** reaches `/grave`
- `apps/web` tests and build pass; output remains `static`
- No NDR is opened

## 14. Not decided here

Leave these to later NIPs:

- Wallet kit, `bury`, `sellToReaper`, approvals, balances from an account
- Enabling Base mainnet (addresses + probed RPC pool)
- Keepers page and spec §19 historical analytics
- Custom domain
- Indexer / Reaper Ratio from a DEX
