# NIP-0011: Wallet connect, bury, and Reaper actions

- Status: Planned
- Date: 2026-08-16
- Workstream: W7 (app / wallet slice)
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md) §6.1, §8.3, §8.5, §8.7, §14
- Stack: Accepted [`NDR-0003`](../ndr/0003-frontend-stack.md)
- Prior slices: [`NIP-0002`](0002-landing-docs.md) (holder + docs), [`NIP-0010`](0010-grave-dashboard.md) (monitoring)
- No NDR in this slice

This plan is the third public frontend slice: connect a wallet on the existing Astro `/grave` page and send the user-facing protocol transactions. It does **not** change era math, Reaper economics, or contract ABIs. The spec wins if anything below disagrees.

[`NDR-0003`](../ndr/0003-frontend-stack.md) already allows a React island plus a Base wallet kit while `output` stays `static`. Wallet libraries are not in that freeze table. Record the kit, connectors, and add-network / add-token behavior here so implementation can start without a new NDR. Switching away from static HTML, adding a Node host, or splitting a second frontend app would still need a new NDR.


## 1. Purpose

Turn the Grave dashboard stubs from [`NIP-0010`](0010-grave-dashboard.md) into working actions against Base and Base Sepolia:

- connect a wallet without rewriting the static site
- show the connected account’s **$NETH** balance (and **ETH** on the bury widget)
- **bury** ETH
- **start** a Reaper auction when none is active (permissionless; the keeper is the usual caller, not a privileged one)
- **sell $NETH** to an active Reaper auction

First-class wallets: **MetaMask**, **Coinbase Wallet**, **Trust Wallet**. Generic path: **EIP-6963** injected discovery plus **WalletConnect v2** for any other WalletConnect-compatible wallet.

When the selected network is Base Sepolia, offer to **add Base Sepolia** to the wallet. Offer to **add $NETH** (Sepolia or Base, matching the selected network) to the wallet’s token list. Native `wallet_addEthereumChain` / `wallet_watchAsset` for wallets that implement those RPCs; a copy-paste guide with public RPC URLs and token fields for the rest.


## 2. Scope

In scope:

- `wagmi` v2 on the existing `/grave` React island (and a small header connect island), using the already-pinned `viem` `2.55.15`
- Connect / disconnect UI in the header **right** cluster (not the center nav)
- Featured connectors for MetaMask, Coinbase Wallet, Trust Wallet, plus a generic WalletConnect / other-injected list
- Site networks remain Base (product default, still disabled until `contracts/deployments/base.json` exists) and Base Sepolia (live). Wallet config includes **both** chains now
- Wrong-network banner: switch the wallet to the site-selected chain; on `4902`, add the chain
- Explicit **Add Base Sepolia** (when Sepolia is selected) and **Add $NETH** controls, with a manual guide fallback
- Live ETH balance on bury, live NETH balance on sell; optional ETH on the account chip
- Send `Grave.bury(minNethOut)` with `value`, `NETH.approve` + `Reaper.sellToReaper(nethIn, minEthOut)`, `Reaper.startAuction()`, and `Reaper.finalizeAuction()` when an auction has expired (required before a new start)
- Spec §14 burial warning still visible before confirm; client-side slippage → `minNethOut` / `minEthOut`
- Simulate before send; surface revert / reject / pending / confirmed; refresh the existing snapshot after a receipt
- Unit tests for slippage, chain-add params, watchAsset params, and connector/feature detection (in-process stubs; no live wallet in CI)
- Web CI still typechecks, tests, and builds static HTML

Out of scope:

- Changing `Grave.sol`, `Reaper.sol`, NETH, adapters, or any ABI
- Enabling Base mainnet dashboard reads (still needs `base.json` + a probed mainnet RPC pool; the wallet kit must already know chain 8453)
- `harvest()`, strategy migration, ownership, `collectSurplus` as a standalone user action
- Keepers page, indexer, DEX price, Reaper Ratio, market cap
- Custom domain, SSR, a second frontend app, a shared npm workspace with `apps/keeper/`
- Email / social login, on-ramps, swaps, ENS profiles as product features
- A new NDR

Do not implement redemption, a peg, or Reaper-pays-holders copy.


## 3. Wallet architecture (investigation)

The generic solution is not a branded kit. It is four wallet-scoped standards, then a thin React layer on top of the `viem` already in `apps/web/`:

| Standard | Role |
|---|---|
| [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) | Discover **every** injected browser wallet (MetaMask, Coinbase extension, Trust extension, Rabby, Brave, …) without `window.ethereum` races |
| [WalletConnect v2](https://walletconnect.com/) (Reown) | QR / deep-link to **any** WalletConnect-compatible mobile wallet, including MetaMask, Coinbase, and Trust on phones |
| [EIP-3085](https://eips.ethereum.org/EIPS/eip-3085) `wallet_addEthereumChain` + [EIP-3326](https://eips.ethereum.org/EIPS/eip-3326) `wallet_switchEthereumChain` | Suggest Base / Base Sepolia |
| [EIP-747](https://eips.ethereum.org/EIPS/eip-747) `wallet_watchAsset` | Suggest $NETH |

wagmi v2’s default `injected()` connector already does EIP-6963 (`multiInjectedProviderDiscovery: true`). Its `walletConnect()` connector is the generic mobile path. Featured wallets are labels and deep-links on top of those two pipes, not a closed allow-list.

### 3.1 Options considered

#### Option A: wagmi v2 + Nether-styled connect panel (chosen)

`wagmi` + `@tanstack/react-query` (required peer) + connectors `injected`, `metaMask`, `coinbaseWallet`, `walletConnect`. A small connect panel copied to the existing Grave chrome (dark field, mahogany accent, Inter / Cormorant). Featured row: MetaMask, Coinbase Wallet, Trust Wallet. Below: every EIP-6963 announcement, then **WalletConnect** for wallets that are not injected.

Writes go through the wallet; public reads stay on the [`NIP-0010`](0010-grave-dashboard.md) RPC pool. Static Astro output is unchanged.

#### Option B: RainbowKit on wagmi

A ready-made modal, WalletConnect explorer, and Base Account support. Default chrome fights the Grave dashboard. Theming it back to SOL Grave / Nether is more work than a short featured list. Still needs a Reown project ID. Heavier CSS than this page needs.

#### Option C: Reown AppKit (formerly Web3Modal)

The most “all wallets” modal. Default gravity is email, socials, on-ramp, swap, and analytics. Those are out of scope and would have to be disabled. Extra branding and bundle for a page that only needs connect + four protocol calls.

#### Option D: Coinbase OnchainKit

Base-native wallet components. Pulls a Coinbase API key, OnchainKit CSS, and Coinbase visual language. Fine as a Coinbase-first app; a poor match for MetaMask / Trust parity and for this site’s chrome. Not the generic path.

#### Option E: `window.ethereum` only (no WalletConnect)

Smallest bundle. Breaks Trust / MetaMask / Coinbase **mobile** unless the user is already inside that wallet’s in-app browser. Fails the generic requirement.

### 3.2 Decision

Chosen: **Option A**.

- Option B/C buy a modal we would immediately restyle or strip.
- Option D is Coinbase-weighted, not generic.
- Option E drops mobile WalletConnect, which is how Trust Wallet (and MetaMask / Coinbase on phones) actually connect to a GitHub Pages origin.
- Option A is the same `viem` stack NDR-0003 already named, keeps output `static`, and uses the two generic protocols (EIP-6963 + WalletConnect) instead of pretending three brand buttons are the whole market.

Working set (not an NDR freeze; pin exact 2.x versions at implementation time against `viem` `2.55.15` and React 19 already in `apps/web/`):

| Piece | Choice | Why |
|---|---|---|
| Wallet React layer | `wagmi` 2.x | Official React companion to the existing `viem` pin |
| Query cache | `@tanstack/react-query` (wagmi peer) | Required by wagmi v2; module singleton for multiple Astro islands |
| Injected | `injected()` + EIP-6963 | Generic browser wallets |
| Featured | `metaMask()`, `coinbaseWallet({ appName: 'Nether' })`, Trust via EIP-6963 target / WalletConnect | User-required majors |
| Mobile / other | `walletConnect({ projectId })` | Generic QR / deep-link |
| Public reads | Existing `rpcPool.ts` + protocol snapshot | Do not replace [`NIP-0010`](0010-grave-dashboard.md) failover with the wallet’s RPC |
| Writes | wagmi `writeContract` / viem wallet client | User signs in their wallet |
| SSR | `ssr: false` | Static GitHub Pages; no Node host |

### 3.3 Reown / WalletConnect project ID

WalletConnect v2 requires a **project ID** from [Reown Cloud](https://cloud.reown.com). It is embedded in the public bundle (not a secret). Implementation:

- Read `import.meta.env.PUBLIC_WALLETCONNECT_PROJECT_ID`
- If unset: hide the WalletConnect row, keep injected / featured extension connectors, show a short note that mobile WalletConnect is unconfigured
- GitHub Pages build: pass the value into `.github/workflows/web.yml` from a repository **variable** (not a secret-that-looks-private)
- In Reown Cloud, allow origin `https://rastsislaux.github.io` (and localhost for `astro dev`)
- Metadata: name `Nether`, url the Pages origin + `base: '/nether/'`, icons `[nethMarkUrl()]` (`public/neth.svg`)

Do not block Sepolia bury on a missing project ID if MetaMask / Coinbase / Trust **extensions** or in-app browsers still connect.


## 4. Featured wallets and the generic path

Connect panel, two groups:

**Recommended**

| Wallet | How we connect | Native add-chain / add-token |
|---|---|---|
| MetaMask | EIP-6963 (`io.metamask`) or `metaMask()`; WalletConnect if only mobile | Yes (`wallet_switchEthereumChain` / `wallet_addEthereumChain` / `wallet_watchAsset`) |
| Coinbase Wallet | `coinbaseWallet()` (extension, mobile, and Coinbase smart wallet) | Add-chain yes; `wallet_watchAsset` often yes — if the wallet replies that it already tracks ERC-20s, show the manual token fields anyway |
| Trust Wallet | EIP-6963 (`com.trustwallet.app`) when injected (extension or in-app browser); otherwise WalletConnect | Yes when injected; WalletConnect sessions often **do not** expose add-chain / watchAsset — use the guide |

**Other wallets**

- Every other EIP-6963 announcement, using the wallet’s own name and icon from the announcement (do not redraw brand marks; Lucide `Wallet` only when metadata has no icon)
- **WalletConnect**: opens the WC QR / explorer. This is the generic solution for Rainbow, imToken, Safe mobile, and anything else in the WC registry

Do not silently grab `window.ethereum`. Do not ship Phantom-only or a closed three-button modal with no WC row.

Icons: connector / EIP-6963 / WC registry images only. Chrome icons stay Lucide (`Wallet`, `Unplug`, `Copy`, `Plus`, `ExternalLink`).


## 5. Networks

Site network switch stays the product selector from [`NIP-0010`](0010-grave-dashboard.md). The wallet must follow it. Do not drive the site network from a random wallet chain (that would put Sepolia users on disabled mainnet).

| Network | Chain ID | Hex | Official RPC (add-chain) | Explorer | Site switch today |
|---|---:|---|---|---|---|
| Base | 8453 | `0x2105` | `https://mainnet.base.org` | https://basescan.org | Visible, disabled until mainnet deploy |
| Base Sepolia | 84532 | `0x14a34` | `https://sepolia.base.org` | https://sepolia.basescan.org | Enabled, default |

Names, RPCs, and explorers follow [Base: Connecting to Base](https://docs.base.org/base-chain/quickstart/connecting-to-base):

- `chainName`: `Base Mainnet` / `Base Sepolia`
- `nativeCurrency`: `{ name: 'Ether', symbol: 'ETH', decimals: 18 }`

`wallet_addEthereumChain` should pass the **official** Base RPC as `rpcUrls[0]`. Wallets keep one (or a few) URLs; they are not our sticky dashboard pool. The manual guide additionally lists the probed public Sepolia URLs from [`NIP-0010`](0010-grave-dashboard.md) §8.1 so a user can paste a backup:

1. `https://sepolia.base.org`
2. `https://base-sepolia-rpc.publicnode.com`
3. `https://base-sepolia.drpc.org`
4. `https://base-sepolia.gateway.tenderly.co`
5. `https://84532.rpc.thirdweb.com`

When mainnet is enabled later, probe a mainnet pool the same way; until then the add-chain payload for Base still uses `https://mainnet.base.org` so the method is ready.

### 5.1 Switch / add flow

After connect, and whenever the site-selected network changes:

1. If `wallet` chain id already matches, do nothing.
2. Else `wallet_switchEthereumChain({ chainId })`.
3. If error **4902** (unrecognized chain) or an equivalent “not added” failure: `wallet_addEthereumChain` with the table above, then switch again.
4. User reject (4001): leave disconnected actions disabled; keep the banner.
5. Method missing (4100) or WalletConnect session without the method: open the **manual network guide** (copy chain name, chain id decimal + hex, official RPC, backup RPCs, explorer, currency).

When the selected network is **Base Sepolia**, the account menu always includes **Add Base Sepolia**. That control is required even if the wallet already has the chain (switch is enough; add is idempotent-or-harmless on MetaMask). When the selected network is Base, the same control is **Add Base**.

Wrong-network banner copy (Sepolia): **This wallet is not on Base Sepolia.** Buttons: **Switch network**, **Add Base Sepolia**, **Show manual steps**.

Do not send `bury` / `approve` / `sellToReaper` / `startAuction` while chain ids disagree.


## 6. Add $NETH to the wallet

$NETH is a standard ERC-20 (spec §4.1): name `Nether`, symbol `NETH`, 18 decimals. Address comes from the selected network’s deployment JSON (`contracts.neth`). Do not hardcode a second address book.

The token mark is already in the tree: `apps/web/public/neth.svg` (user-supplied, black fill) and `NethMark` for in-app `currentColor` use. Dashboard diamonds (`Gem`) were replaced by that component. Wallet integrations use the public SVG URL from `nethMarkUrl()` (`https://rastsislaux.github.io/nether/neth.svg` on Pages).

### 6.1 Native `wallet_watchAsset`

```text
method: wallet_watchAsset
type: ERC20
options.address: <deployment NETH>
options.symbol: NETH
options.decimals: 18
options.image: nethMarkUrl()
```

Offer it:

- in the **$NETH** bar (always, when an address exists)
- in the account menu
- after a **successful bury** (the user just received NETH and will not see it in MetaMask until they watch it)

If the call is unsupported, rejected, or Coinbase replies that it auto-tracks balances: fall through to the guide. Never pretend the token was added when the RPC failed.

### 6.2 Manual token guide (all wallets)

Copyable fields + short per-wallet steps:

| Field | Value |
|---|---|
| Network | Base / Base Sepolia (the selected one) |
| Token contract | `0x…` (NETH) + Basescan link |
| Symbol | `NETH` |
| Decimals | `18` |

Generic steps (any EVM wallet): open the selected network → import / custom token → paste contract → confirm symbol and decimals.

Wallet-specific hints (only as extra sentences, not a third UI):

- **MetaMask:** Import tokens → Custom token
- **Coinbase Wallet:** the asset list may already show balances; if not, Import token
- **Trust Wallet:** the selected Base / Base Sepolia network → Manage crypto → Add custom token → Ethereum-compatible / Base

Sepolia NETH will not appear on mainnet Base explorers or token lists. The guide must name the **selected** network so users do not import the Sepolia address onto Base.


## 7. UI on `/grave`

Keep the [`NIP-0010`](0010-grave-dashboard.md) layout. Replace stubs; do not add a second app route.

### 7.1 Header

Center nav stays **GRAVE · DOCS · SOURCE** (no CONNECT tab). Right cluster:

1. existing Base / Base Sepolia switch
2. **Connect wallet** when disconnected (accent button, Lucide `Wallet`)
3. when connected: truncated address `0xAbCd…1234`, optional ETH balance, click → account menu (copy address, explorer link, add network, add $NETH, disconnect)

Astro has one React root per `client:load` island. Use a **module-level** `wagmi` `config` and `QueryClient`, and wrap both the header island and `DashboardApp` in `WagmiProvider` + `QueryClientProvider`. Do not lift the whole site into one React tree.

### 7.2 Balances

| Surface | Disconnected | Connected, correct chain | Wrong chain |
|---|---|---|---|
| Bury “You bury” | `Balance: —` | native ETH `balanceOf` / `getBalance` | `Balance: —` + banner |
| Sell “You sell” | `Balance: —` | `NETH.balanceOf(owner)` | `Balance: —` + banner |
| Account chip | — | truncated address; ETH optional | truncated address + wrong-network state |

Clicking the balance label fills the input (MAX), leaving a small ETH remainder on bury so the user can still pay gas (implementation: keep 0.0001 ETH or the estimated gas*price, whichever is larger; if the wallet has less, fill what they have and let simulate fail clearly).

### 7.3 Bury

Unlock **BURY ETH** when: connected, correct chain, amount > 0, amount ≤ spendable ETH, quote succeeded.

Pre-send panel (required; spec §14 copy must be on screen before the wallet prompt):

- ETH in, estimated NETH out, era-split breakdown if the amount crosses a boundary (already in the stub)
- slippage / `minNethOut`
- the permanent-burial paragraph, unchanged:

> Buried ETH is permanent. You cannot withdraw it. In exchange, the protocol mints NETH according to the current era. The Grave deploys its capital to earn yield, and harvestable yield funds the Reaper.

Call `bury(minNethOut)` with `value = amount`. `minNethOut = quoteBury(amount) * (1 - slippage)`, floored. Default slippage **0.5%**; presets 0.1% / 0.5% / 1% plus custom. This is UI only; it does not change contract math.

On confirm: optional **Add $NETH** prompt.

### 7.4 Sell to Reaper

Unlock **SELL NETH** when: connected, correct chain, auction active and not expired, amount > 0, amount ≤ NETH balance, quote succeeded.

`sellToReaper` pulls NETH with `transferFrom`, so the flow is:

1. If `allowance(owner, reaper) < nethIn`, send `approve(reaper, nethIn)` for the **exact** sell amount (not `type(uint256).max`)
2. Simulate `sellToReaper(nethIn, minEthOut)`
3. Send; `minEthOut` from `quoteReaperSale` with the same slippage rule

Partial fills are protocol behavior (spec §8.5): unused NETH stays with the seller. The quote already reflects remaining auction ETH. Show estimated ETH out and the spec warning that waiting may improve the rate but others can consume the budget.

Two-step approve + sell is expected. Do not hide the approve transaction.

### 7.5 Start auction (and finalize)

[`NIP-0010`](0010-grave-dashboard.md) empty state is “No active auction. Check back when a new auction begins.” Replace that when a user can actually crank:

| Reaper state | Right pane |
|---|---|
| Active, not expired | Sell widget (as now, but live) |
| Active, expired | **Auction ended.** **Finalize auction** (permissionless). Starting is disabled until finalize succeeds — `startAuction` reverts `AuctionActive` until then |
| Inactive, `availableReaperETH > 0` | Idle budget, **Start auction**. Copy: anyone may start; the Grave keeper usually does; the caller pays gas; the 7-day curve snapshots the current era rate (spec §8.3–§8.4). No protocol minimum budget |
| Inactive, `availableReaperETH == 0` | Keep the empty skull + “Check back…” |

Do not auto-start auctions. Do not take a keeper incentive. Do not add harvest to this pane.


## 8. Transaction plumbing

Hand-extend ABI fragments in `apps/web/src/lib/abi.ts` (still no codegen from `contracts/out`):

- `bury(uint256 minNethOut) payable`
- `approve(address spender, uint256 amount)` / `allowance` / `balanceOf` on NETH
- `sellToReaper(uint256 nethIn, uint256 minEthOut)`
- `startAuction()` / `finalizeAuction()`

Policy, matching the keeper’s caution without sharing a package:

1. Disable the button while a tx for that action is pending
2. `simulateContract` on the public client (RPC pool) with `account = connected address`
3. On simulate failure, show the revert short message; do not send
4. Send via the wallet; wait for 1 confirmation
5. Invalidate balances + trigger the existing snapshot reload
6. User reject is not an error banner of “RPC down”; it is a quiet return to the form

Do not route public dashboard reads through the wallet provider. Wallet RPCs are often slower, lack Multicall quirks we already handled, and would skip the sticky pool.


## 9. Tree

All new code stays under `apps/web/`. No root `package.json`. No import from `apps/keeper/`.

```
apps/web/
├── public/neth.svg                  canonical black $NETH mark (already shipped)
├── package.json                     add wagmi, @tanstack/react-query; keep viem 2.55.15
├── src/lib/
│   ├── nethMark.ts                  path + nethMarkUrl() (already shipped)
│   ├── networks.ts                  add-chain payloads (hex id, official RPC, explorer)
│   ├── token.ts                     NETH watchAsset + manual-guide fields
│   ├── slippage.ts                  minOut from quote + bps
│   ├── wagmi.ts                     createConfig, connectors, singleton queryClient
│   └── abi.ts                       add write fragments
├── src/components/
│   ├── NethMark.tsx                 currentColor UI mark (already shipped)
│   ├── Header.astro                 right cluster: NetworkSwitch + ConnectButton island
│   ├── wallet/                      connect modal, account menu, wrong-network, guides
│   └── dashboard/                   live bury / sell / start / finalize; balances
└── .github/workflows/web.yml        PUBLIC_WALLETCONNECT_PROJECT_ID on build
```

`contracts/` unchanged.


## 10. Tests and CI

`node:test` next to the existing web tests. No mocking library. Stub EIP-1193 providers in process.

Cover:

- Slippage: 0.5% of 1e18 is the floored minOut; zero amount → 0; 100% slippage → 0
- Add-chain payload: Sepolia `chainId` `0x14a34`, name `Base Sepolia`, RPC `https://sepolia.base.org`, explorer `https://sepolia.basescan.org`, decimals 18
- Add-chain payload: Base `0x2105`, `https://mainnet.base.org`, `https://basescan.org`
- Switch/add: matching chain is a no-op; 4902 triggers add; 4100 / missing provider method selects the guide path; 4001 is user-reject
- `wallet_watchAsset` options: selected-network NETH address, symbol `NETH`, decimals 18, `image` = `nethMarkUrl()`
- Connector grouping: MetaMask / Coinbase / Trust are featured; unknown EIP-6963 ids fall in Other; WalletConnect hidden when project ID is empty
- MAX bury leaves a gas reserve when ETH > reserve; below reserve fills the full balance

CI: existing `apps/web` job. Build remains `output: 'static'`. WalletConnect project ID may be absent in PR CI; tests and injected config must still pass.


## 11. Implementation steps

Do not run these until this NIP is explicitly started.

1. Add `wagmi` 2.x and `@tanstack/react-query`; keep Astro / Tailwind / TypeScript / `viem` pins.
2. Module-level wagmi config: `base` + `baseSepolia`, EIP-6963 injected, featured connectors, optional WalletConnect.
3. Header connect island + account menu; wrap dashboard in the same providers.
4. Chain match / add-chain / manual network guide (Sepolia first; Base payload present).
5. Balances; unlock bury with simulate + `minNethOut`; §14 warning in the confirm step.
6. Approve + `sellToReaper`; start / finalize auction states in the Reaper pane.
7. Add $NETH (`wallet_watchAsset` + manual token guide) on the $NETH bar, account menu, and post-bury.
8. Tests; pass `PUBLIC_WALLETCONNECT_PROJECT_ID` through Pages build when the variable exists.


## 12. Acceptance criteria

This slice is done when:

- A user can connect MetaMask, Coinbase Wallet, and Trust Wallet (extension and/or WalletConnect mobile) on `/grave` without leaving static GitHub Pages
- Other EIP-6963 wallets appear without a code change; WalletConnect is the catch-all when a project ID is configured
- ETH and $NETH balances show for the connected account on the correct chain
- **BURY ETH** sends `bury(minNethOut)` with the spec warning visible before the wallet prompt
- **SELL NETH** approves exact NETH then `sellToReaper`; inactive/expired auctions cannot sell
- When idle Reaper ETH exists, a connected user can **start** an auction; when an auction is expired they can **finalize** first
- On Base Sepolia, the UI offers **Add Base Sepolia**; wallets that implement EIP-3085 get a native prompt; others get RPC URLs, chain id `84532` / `0x14a34`, explorer, and currency
- The UI offers **Add $NETH** for the selected network’s token address; native `wallet_watchAsset` (including `image: nethMarkUrl()`) on supported wallets; manual contract / symbol / decimals guide otherwise
- Wrong-network wallets cannot send protocol txs
- Disconnect returns bury/sell to the previous stub-like disabled state with `Balance: —`
- `apps/web` tests and build pass; output remains `static`
- No NDR is opened


## 13. Not decided here

Leave these to later NIPs / ops:

- Enabling Base mainnet reads (`contracts/deployments/base.json` + probed mainnet RPC pool). Wallet chain 8453 support in this slice is preparatory only
- Creating the Reown Cloud project and storing `PUBLIC_WALLETCONNECT_PROJECT_ID` (ops, not protocol)
- Keepers page, harvest from the UI, indexer, custom domain
