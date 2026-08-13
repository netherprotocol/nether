# apps/web

Landing site and project dashboard (W7). Own frontend environment, separate from `contracts/` and `apps/keeper/`.

Frontend stack: Proposed [`NDR-0003`](../../docs/ndr/0003-frontend-stack.md). First slice: [`NIP-0002`](../../docs/nip/0002-landing-docs.md) (holder + `docs/**`). Do not scaffold the Astro tree until that NIP is explicitly started.

Indexer technology is not chosen. Live protocol reads for a later dashboard use spec §12 views, not an indexer.
