# apps/web

Landing site and documentation ([`NIP-0002`](../../docs/nip/0002-landing-docs.md)). Stack: [`NDR-0003`](../../docs/ndr/0003-frontend-stack.md).

```
npm ci
npm run dev
npm run build
```

Commands run from `apps/web/`. The site is static HTML with `base: /nether/` for GitHub Pages at `https://rastsislaux.github.io/nether/`. Documentation is built from repo `docs/**`; do not copy Markdown into this tree.

Live protocol reads and wallet UI are out of this slice. Pages publish from `master` via `.github/workflows/web.yml`.
