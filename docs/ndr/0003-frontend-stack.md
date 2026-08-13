# NDR-0003: Frontend stack

- Status: Proposed
- Date: 2026-08-13
- Supersedes: (none)
- Superseded by: (none)

This record is a **draft**. It is not accepted and does not freeze production frontend bytecode or hosting. [`NIP-0002`](../nip/0002-landing-docs.md) may install these versions as the working set for the landing and documentation site. Acceptance locks the table; a later framework, output-mode, or host change requires a new NDR.

Indexer technology is **out of scope**. Live protocol reads for a later dashboard use on-chain views (spec §12), not an indexer. An indexer NDR remains queued for W8 if historical analytics need one.

## Context

[`protocol_spec.md`](../protocol_spec.md) §22 allows the implementation to choose a frontend framework. §14 specifies burial/Reaper/Grave UI behavior. §12 lists the views that UI and indexers need. The spec does not name a framework, CSS toolchain, package manager, or host.

[`NIP-0000`](../nip/0000-the-roadmap.md) places landing and dashboard in W7 under `apps/web/`, and says the stack is an NDR when a choice is required. [`NIP-0001`](../nip/0001-scaffolding.md) already forbids mixing Node into `contracts/` and requires `apps/web/` to own its own manifest.

The first public surface is a two-page site (holder landing + `docs/**` rendered as authored). Search engines must index it. Later W7 work will add on-chain monitoring (NETH supply, Grave principal/NAV, Reaper ETH, era state) and the bury/Reaper screens. That later work must not force a rewrite of the site generator or a paid Node host.

Visual language is copied from the attached **The SOL Grave** screenshots (dark field, serif display + sans UI, mahogany accent, sparse hero). Product names and economics follow this spec, not that reference: Nether’s Reaper buys and burns NETH; it does not pay holders pro-rata.

## Decision drivers

- HTML that crawlers can index without executing a client bundle (landing copy, docs, titles, sitemap).
- Cheap or free hosting of static files; no required serverless bill for the first site.
- Markdown in `docs/` stays the source of truth and is published as it is authored (spec, NIPs, NDRs, tables, code).
- Room to add a later dashboard and wallet UI as hydrated islands without leaving static output.
- Live protocol numbers can come from Base RPC + §12 views (same idea as the reference: “numbers come from on-chain accounts — not an indexer”).
- Isolated from Foundry: Node lives only under `apps/web/`.
- Small working set. No SSR platform lock-in (Vercel-only features, persistent Node, paid edge).

## Options

### Option A: Vite + React SPA

A client-rendered React app (the procenty pattern: Vite, React Router, a post-build SEO HTML generator). Wallet and dashboard components are ordinary React.

Crawlers see a shell unless every route is prerendered. Docs need a custom Markdown pipeline. Hosting can still be static, but indexability is extra work.

### Option B: Next.js App Router

React with SSG/SSR. Good SEO if pages are prerendered. Dashboard and wagmi are conventional. Default gravity is a Node/serverless host (Vercel or an adapter). Static export is possible but drops several Next features. Heavier than a two-page site needs.

### Option C: Astro static HTML with optional islands (chosen)

Astro `output: 'static'`. Pages are HTML at build time. Markdown from the repo `docs/` tree is rendered at build time. Zero client JS until a component opts in. Later Grave/Reaper/wallet widgets are Astro islands (React or otherwise) that call `viem` against Base RPC. Deploy the `dist/` folder to GitHub Pages.

### Option D: Astro Starlight

Astro’s documentation theme. Fast docs site, weaker match for a custom dark hero that must copy The SOL Grave. Fighting the theme for the holder page is more work than a small custom layout.

### Option E: VitePress

Vue docs SSG. Excellent documentation, awkward custom marketing page, Vue commitment for later wallet/dashboard. Static and cheap.

### Option F: Docusaurus

React docs product. SEO is fine. Heavier runtime and theming than a two-page static site. Dashboard would live inside a docs chrome or a second app.

## Decision

Chosen option: **Option C**, because it is the only option that hits indexability, cheap static hosting, first-class Markdown, and a later on-chain dashboard without a framework or host change.

- Option A fails the SEO driver unless we rebuild prerendering that Astro already does.
- Option B is the right tool for an authenticated product, not a two-page static holder plus Markdown. It also pulls toward a Node host.
- Option D/E/F optimize for a docs portal. Nether’s first page is a branded holder; docs are the second route, styled to match the holder, not the other way around.

Proposed freeze table (as of 2026-08-13):

| Component | Version / choice | Source |
|---|---|---|
| Site generator | Astro `7.2.2` | [npm `astro`](https://www.npmjs.com/package/astro) |
| Output | `static` (`output: 'static'`) | HTML/CSS (and only opted-in JS) in `apps/web/dist/` |
| Language | TypeScript `5.x` (working: `7.0.2`) | `apps/web/tsconfig.json`, strict |
| Node | `22` LTS | Matches current 22.x; do not require 24 |
| Package manager | npm (`package-lock.json` in `apps/web/`) | No root `package.json`, no pnpm workspace |
| CSS | Tailwind CSS `4.3.3` via `@tailwindcss/vite` | Utility styling for the reference UI |
| Sitemap | `@astrojs/sitemap` `3.7.3` | Build-time sitemap |
| Docs input | Repo `docs/**/*.md` via Astro content `glob` loader | Do not duplicate Markdown under `src/content/` |
| Host | GitHub Pages (Actions) | Free static host; this repo is already on GitHub |
| `site` / `base` | Configurable; default project URL `https://rastsislaux.github.io/nether/` with `base: '/nether/'` until a custom domain is named | GitHub Pages project site |
| Later live reads | `viem` islands against Base / Base Sepolia RPC and spec §12 views | Not installed in the landing slice |
| Later wallet UI | Official Astro UI integration (likely `@astrojs/react`) + a Base wallet kit | Allowed without a new NDR if output stays `static` |

Not in this freeze: indexer, Gravekeeper, wallet libraries, RPC providers, custom domain, and the bury/Reaper application screens (later W7 NIP).

## Consequences

- [`NIP-0002`](../nip/0002-landing-docs.md) scaffolds `apps/web/` with this working set. Do not start that NIP until asked.
- CI for the web tree is a separate GitHub Actions workflow from `contracts.yml`. It typechecks and builds; deploy to Pages may wait until the landing slice is accepted to go live.
- Adding React (or another official Astro integration) and `viem` for a dashboard does **not** require a new NDR if `apps/web/` remains static and isolated. Switching to SSR, a Node host, a second frontend app, or an indexer **does**.
- Indexer technology stays queued for W8. Do not introduce The Graph, Ponder, or a custom event indexer in the landing slice.
- Visual implementation follows [`NIP-0002`](../nip/0002-landing-docs.md) and the attached SOL Grave screenshots. Public copy follows spec §1 and §14, not the reference’s Reaper payout sentence.
- Accepting this NDR is a gate for treating the table as frozen, not a gate for writing NIP-0002.
