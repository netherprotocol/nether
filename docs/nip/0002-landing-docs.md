# NIP-0002: Landing site and documentation

- Status: Implemented
- Date: 2026-08-13
- Workstream: W7 (landing slice only)
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Stack: [`NDR-0003`](../ndr/0003-frontend-stack.md) (Accepted)
- Visual reference: attached **The SOL Grave** landing screenshot (holder) and dashboard screenshot (later monitoring, not this slice)

This plan is the first public frontend slice: a two-page static site. It does not implement bury/Reaper/wallet UI and does not read chain state. The frontend stack is frozen by NDR-0003.

## 1. Purpose

Ship an indexable holder for Nether and a Documentation surface that publishes `docs/**` as authored in this repository, visually copied from The SOL Grave holder, with names and economics rewritten for Nether.

Unblock later W7 app work (Grave dashboard, bury, Reaper) on the same Astro tree via islands, without an indexer.

## 2. Scope

In scope:

- Scaffold `apps/web/` as an Astro static site using NDR-0003 versions
- Two product pages: holder (`/`) and Documentation (`/docs` and per-file routes)
- Visual copy of the SOL Grave holder (layout, type contrast, color, chrome)
- Spec-accurate Nether copy (not SOL Grave economics)
- Build-time render of every Markdown file under repo `docs/`
- SEO basics: titles, description, canonical, Open Graph, `robots.txt`, sitemap
- Isolated npm manifest, ignore rules already reserved by NIP-0001, and a web CI workflow
- GitHub Pages deploy from Actions on `master` (`withastro/action` `path: apps/web`)

Out of scope:

- Wallet connect, network selector, Localnet/Base toggle
- `ENTER THE GRAVE` bury flow, quotes, transactions
- Live stats (buried ETH, era, Reaper liquid, NAV, supply)
- Keepers page
- Indexer, The Graph, Ponder, or event ingestion
- Custom domain
- Changing protocol copy in `docs/protocol_spec.md`

## 3. Information architecture

Two pages in the product sense. Documentation has one URL per Markdown file.

| Route | Role |
|---|---|
| `/` | Holder: brand, short description, CTAs |
| `/docs` | Documentation index: the `docs/` tree |
| `/docs/...` | One route per `docs/**/*.md`, path derived from the file path |

Nav for this slice (center links, all-caps sans, matching the reference chrome):

- **Nether** (left, serif brand) → `/`
- **DOCUMENTATION** (center) → `/docs`

Do **not** ship GRAVE, KEEPERS, CONNECT, or a network dropdown in this slice. Those belong to later W7/W8 NIPs ([`NIP-0010`](0010-grave-dashboard.md) for the dashboard and network switch; [`NIP-0011`](0011-wallet-connect.md) for connect / bury / sell). Keep header slots in the layout so they can return without a redesign.

Route mapping (kebab-case, drop `.md`, `README.md` → folder index):

| File | URL |
|---|---|
| `docs/protocol_spec.md` | `/docs/protocol-spec` |
| `docs/implementation_roadmap.md` | `/docs/implementation-roadmap` |
| `docs/ndr/README.md` | `/docs/ndr` |
| `docs/ndr/0001-adopt-immutable-ndrs.md` | `/docs/ndr/0001-adopt-immutable-ndrs` |
| `docs/nip/README.md` | `/docs/nip` |
| `docs/nip/0000-the-roadmap.md` | `/docs/nip/0000-the-roadmap` |
| (any later `docs/**/*.md`) | same rule; do not hand-maintain a file list |

Internal Markdown links between docs must resolve on the site (rewrite `.md` and relative paths at build time).

## 4. Visual spec (copy The SOL Grave holder)

Source of truth for look: the attached landing screenshot. Dashboard screenshot is the target look for a **later** monitoring page, not this slice.

### 4.1 Chrome

- Full-viewport dark field, near-black (`#000` / very dark charcoal).
- Soft desaturated reddish-brown (mahogany / dried blood) radial glow, center-right, low opacity. No illustration, no coin art, no extra ornament.
- Header: three zones — brand left, text nav center, empty utility right (reserved).
- Brand: “Nether” in white elegant serif, not “The ETH Grave” and not “The SOL Grave”.

### 4.2 Type

- Display / brand / page titles: high-contrast serif (self-host a webfont; candidates that match the reference: Cormorant Garamond, Playfair Display, or Cinzel). Pick one and use it consistently.
- Nav, body, buttons, docs body: thin modern sans (self-host Inter or equivalent).
- Nav and buttons: small tracking, all-caps.
- Do not load fonts from a runtime Google Fonts CSS request; self-host via Fontsource or files under `apps/web/public/fonts/`.

### 4.3 Holder layout

Hero sits in the **lower-left** of the viewport. Large empty dark space above and to the right.

1. Title: **Nether** (large white serif).
2. One short paragraph (sans, white / off-white).
3. Two rectangular CTAs, side by side:
   - Primary: filled muted reddish-brown, white all-caps.
   - Secondary: ghost — thin reddish-brown border, transparent fill, white all-caps.

### 4.4 Documentation chrome

Same header and background family as the holder. Content is a readable column (optional left tree of the `docs/` folders). Thin low-opacity rules, generous vertical space, gold/off-white body text on black — closer to the dashboard screenshot’s type hierarchy than to a default GitHub white page.

Markdown must look like the repo file: headings, tables, fenced code, lists, block quotes, links. GFM tables are required (the spec and NDRs use them).

### 4.5 What not to copy from the reference

| Reference | Nether |
|---|---|
| “The SOL Grave” | Nether |
| SOL / $SOUL | ETH / $NETH |
| WHITEPAPER | DOCUMENTATION |
| “When the dead earn, the Reaper pays — pro-rata…” | Forbidden. Nether’s Reaper buys NETH with yield ETH and burns it (spec §1, §8). It does not pay holders. |
| Localnet + CONNECT | Later W7 |
| Live 42 SOL / era bar / Reaper liquid | Later monitoring NIP |

## 5. Public copy

Primary product language is burial, not staking (spec §14). Do not invent a peg, redemption, or yield-to-holder promise.

**Holder paragraph** (this slice):

> Bury ETH forever. Mint $NETH. When the Grave earns, the Reaper buys and burns — no redemption, no peg, no promises.

That is the SOL Grave sentence with names changed and the Reaper clause corrected. Do not substitute marketing that contradicts spec §1.

**Primary CTA label:** `ENTER THE GRAVE`  
In this slice it is visible (to match the screenshot) but **not** a bury flow. Use `aria-disabled` (or equivalent) and no wallet modal. Title/tooltip: the app ships in a later W7 NIP. Do not link it to `/docs`.

**Secondary CTA label:** `DOCUMENTATION` → `/docs`.

Optional `<title>` / meta description (SEO, not on-canvas):

- Title: `Nether`
- Description: `Permanently capitalized monetary protocol on Base. Bury ETH in the Grave, mint NETH. Yield funds the Reaper, which buys and burns NETH.`

If a later edit changes on-canvas copy, it still must not contradict spec §1–§14. That is not an NDR.

## 6. Documentation rendering

`docs/` in git is the only source. Astro `glob` loader `base` points at the repo `docs/` directory (from `apps/web/`, that is `../../docs`). Do not copy or symlink files into `src/content/` as a second tree.

Requirements:

- No extra frontmatter required on existing docs. They have none today; the loader must not fail closed on missing `title`.
- Title for the page chrome: first Markdown `h1` if present, otherwise the file path.
- Render the body as it appears: do not inject a second H1 that duplicates the file’s H1; do not wrap in a blog layout with dates or authors.
- Preserve tables, code fences, and relative links.
- Index (`/docs`) lists the tree grouped as in the repo: protocol spec, NDRs, NIPs, and any other `docs/` files.
- New files under `docs/` appear on the next web build with no web-code change.

Out of this renderer: editing docs in the browser, search, version switcher, i18n.

## 7. SEO and deploy

Build output is static HTML. Every holder and docs URL must contain the visible title and body in the first response (no client-only Markdown).

Minimum:

- Per-page `<title>` and meta description
- `canonical` using `site` + `base`
- Open Graph title/description
- `public/robots.txt` allowing `/`
- `@astrojs/sitemap`
- Semantic landmarks (`header`, `main`, `nav`)

Host: GitHub Pages via Actions, `apps/web` as the Astro project path (`withastro/action` `path: apps/web`). Default branch for this repo is `master`. Deploy runs on push to `master` and on `workflow_dispatch` from `master`. Pull requests build and upload the Pages artifact but do not publish.

Until a custom domain exists:

```js
site: 'https://rastsislaux.github.io',
base: '/nether/',
```

Internal links must respect `base` (Astro `<a href={import.meta.env.BASE_URL + 'docs/'}>` or equivalent). A later custom domain drops `base` and updates `site`; that is config, not a new NDR.

## 8. Tree

```
apps/web/
├── package.json                 npm; no workspaces
├── package-lock.json
├── astro.config.ts
├── tsconfig.json
├── src/
│   ├── content.config.ts        glob → ../../docs
│   ├── layouts/
│   ├── pages/
│   │   ├── index.astro          holder
│   │   └── docs/
│   │       ├── index.astro      tree
│   │       └── [...slug].astro  one page per markdown file
│   ├── styles/
│   └── components/
├── public/
│   ├── robots.txt
│   └── fonts/                   if not using Fontsource
└── README.md
```

No root `package.json`. No React, `viem`, or wallet packages in this slice.

## 9. CI

Add `.github/workflows/web.yml` (separate from `contracts.yml`):

- Pull requests: `ci` job (`npm ci` and `npm run build`, Node 22)
- `master` push and `workflow_dispatch`: `withastro/action@v6` with `path: apps/web` and `node-version: '22'`, then `actions/deploy-pages@v5`

Do not run `forge` from this workflow.

## 10. Implementation steps

Do not run these until this NIP is explicitly started.

1. Replace the `apps/web/` stub with an Astro 7 static project at the NDR-0003 versions.
2. Tailwind 4 + self-hosted display/sans fonts; global dark styles matching §4.
3. Shared header layout (brand, DOCUMENTATION, reserved right slot).
4. Holder page copy and CTAs from §5.
5. Content collection over `../../docs/**/*.md`; `[...slug]` routes; `/docs` tree.
6. Link rewriting so spec/NDR/NIP cross-links work on the site.
7. Sitemap, robots, meta tags; `site` / `base` for GitHub Pages.
8. `web.yml` build on PR; deploy from `master`.
9. Confirm `npm run build` emits real HTML for `/` and a spec page (grep the heading in `dist/`, not only in the JS bundle).

SPDX / license on web files: none required beyond `package.json` `"private": true` unless a later docs change says otherwise.

## 11. Acceptance criteria

This slice is done when:

- `apps/web` builds static HTML with NDR-0003 versions
- `/` matches the SOL Grave holder layout with Nether naming and the §5 paragraph
- `/docs` and each `docs/**/*.md` file are reachable and readable, including GFM tables
- Adding a new `docs/nip/*.md` shows up after rebuild with no web source change
- Crawlers can see holder and spec text in static HTML
- No wallet, RPC, indexer, or bury UI is present
- NDR-0003 is Accepted

## 12. Not decided here

Leave these to later NDRs / NIPs:

- Indexer (W8)
- Gravekeeper ([`NIP-0009`](0009-grave-keeper.md))
- Bury / Reaper / Grave dashboard application screens ([`NIP-0010`](0010-grave-dashboard.md) is the monitoring slice; wallet bury/sell still later)
- Wallet kit and RPC provider
- Custom domain
- On-canvas copy changes after this slice, provided they stay inside spec §1 and §14
