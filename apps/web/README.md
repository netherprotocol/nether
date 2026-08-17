# apps/web

Landing site, documentation, and Grave dashboard ([`NIP-0002`](../../docs/nip/0002-landing-docs.md), [`NIP-0010`](../../docs/nip/0010-grave-dashboard.md), [`NIP-0011`](../../docs/nip/0011-wallet-connect.md)). Stack: [`NDR-0003`](../../docs/ndr/0003-frontend-stack.md).

```
npm ci
npm test
npm run dev
npm run build
```

Commands run from `apps/web/`. The site is static HTML at `https://netherprotocol.xyz/` (`base: /`). Documentation is built from repo `docs/**`; do not copy Markdown into this tree.

`/grave` reads spec §12 views from Base Sepolia through a sticky public RPC pool. Wallet connect, bury, sell-to-Reaper, and permissionless start/finalize use wagmi on the same page. WalletConnect v2 needs `PUBLIC_WALLETCONNECT_PROJECT_ID` (public Reown project ID). Copy `.env.example` for local `astro dev`; Pages builds take the repository variable of the same name. Injected wallets still work if it is unset. Pages publish from `master` via `.github/workflows/web.yml`.
