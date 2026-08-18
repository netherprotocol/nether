# apps/keeper

Gravekeeper console cranker ([`NIP-0009`](../../docs/nip/0009-grave-keeper.md), recover path in [`NIP-0012`](../../docs/nip/0012-impaired-strategy-capital.md)). Permissionless `harvest()`, `recoverImpaired()`, `startAuction()`, and `finalizeAuction()` from an operator EOA. The bot pays its own gas and skips dust harvests and auctions by default. Recovered principal is not dust-skipped unless `--min-recover-wei` is set.

Requires Node 22. Run commands from `apps/keeper/`.

```
npm ci
npm run build
node dist/index.js once
```

Copy `.env.example` and export the variables (or pass flags). Prefer `NETHER_PRIVATE_KEY` over `--private-key`. `--dry-run` never sends and does not require a key.

```
node dist/index.js --help
node dist/index.js once --dry-run
node dist/index.js watch
```

`npm run check` typechecks. `npm test` compiles and runs `node:test` offline (no live RPC).
