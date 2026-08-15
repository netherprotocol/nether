# apps/web

Landing site, documentation, and Grave dashboard ([`NIP-0002`](../../docs/nip/0002-landing-docs.md), [`NIP-0010`](../../docs/nip/0010-grave-dashboard.md)). Stack: [`NDR-0003`](../../docs/ndr/0003-frontend-stack.md).

```
npm ci
npm test
npm run dev
npm run build
```

Commands run from `apps/web/`. The site is static HTML with `base: /nether/` for GitHub Pages at `https://rastsislaux.github.io/nether/`. Documentation is built from repo `docs/**`; do not copy Markdown into this tree.

`/grave` reads spec §12 views from Base Sepolia through a sticky public RPC pool. Wallet connect, `bury`, and `sellToReaper` are stubs. Pages publish from `master` via `.github/workflows/web.yml`.
