<p align="center">
  <img src="apps/web/public/neth.svg#gh-light-mode-only" width="128" height="128" alt="Nether">
  <img src=".github/neth-on-dark.svg#gh-dark-mode-only" width="128" height="128" alt="Nether">
</p>

<h1 align="center">Nether</h1>

<p align="center">
  Permanently capitalized monetary protocol on Base.<br>
  Bury ETH in the Grave, mint NETH. Yield funds the Reaper, which buys and burns NETH.
</p>

<p align="center">
  <a href="https://netherprotocol.xyz/">Website</a>
  ·
  <a href="https://netherprotocol.xyz/learn">Learn</a>
  ·
  <a href="https://netherprotocol.xyz/docs">Docs</a>
  ·
  <a href="https://discord.gg/N9mTHr5VE">Discord</a>
  ·
  <a href="https://x.com/netherprotocol">X</a>
</p>

<p align="center">
  <a href="https://github.com/netherprotocol/nether/actions/workflows/contracts.yml"><img src="https://github.com/netherprotocol/nether/actions/workflows/contracts.yml/badge.svg" alt="contracts"></a>
  <a href="https://github.com/netherprotocol/nether/actions/workflows/web.yml"><img src="https://github.com/netherprotocol/nether/actions/workflows/web.yml/badge.svg" alt="web"></a>
  <a href="https://github.com/netherprotocol/nether/actions/workflows/keeper.yml"><img src="https://github.com/netherprotocol/nether/actions/workflows/keeper.yml/badge.svg" alt="keeper"></a>
</p>

Nether is a permanently capitalized monetary protocol on Base. You bury ETH into the Grave and receive newly minted NETH according to the current era. Buried ETH becomes permanent protocol capital: it cannot be redeemed by the burier, the team, governance, or the Reaper.

The Grave deploys that capital into an ETH-denominated yield strategy. Harvestable yield above protected principal goes to the Reaper, which acquires NETH through a protocol-native reverse Dutch auction and burns every token it buys. There is no ETH redemption, no NETH peg, and no guaranteed market price.

## Documentation

The protocol spec is the source of truth for monetary behavior. Implementation sequence lives in NIPs. Frozen design choices live in NDRs. If a plan and the spec disagree, the spec wins.

- Protocol specification: [`docs/protocol_spec.md`](docs/protocol_spec.md)
- Nether Implementation Plans: [`docs/nip/`](docs/nip/)
- Nether Decision Records: [`docs/ndr/`](docs/ndr/)
- Published docs: [netherprotocol.xyz/docs](https://netherprotocol.xyz/docs)
- Learn: [netherprotocol.xyz/learn](https://netherprotocol.xyz/learn)

## Repository

The trees are isolated. There is no root `package.json`. Each environment has its own README.

```
contracts/     Solidity (Foundry)
apps/web/      Landing, Learn, docs portal, and Grave dashboard
apps/keeper/   Gravekeeper cranker
docs/          Spec, NDRs, NIPs
```

Clone with submodules:

```text
git clone --recurse-submodules https://github.com/netherprotocol/nether.git
```

If you already cloned without them: `git submodule update --init --recursive`.

| Tree | Stack | Commands |
|---|---|---|
| [`contracts/`](contracts/README.md) | Foundry | `forge fmt --check`, `forge build`, `forge test` |
| [`apps/web/`](apps/web/README.md) | Node 22, Astro | `npm ci`, `npm test`, `npm run dev` |
| [`apps/keeper/`](apps/keeper/README.md) | Node 22, TypeScript | `npm ci`, `npm test`, `npm run check` |

## Community

- Discord: [discord.gg/N9mTHr5VE](https://discord.gg/N9mTHr5VE) — questions and discussion
- X: [@netherprotocol](https://x.com/netherprotocol) — protocol updates
- GitHub: [netherprotocol/nether](https://github.com/netherprotocol/nether) — source and pull requests

## Contributing

Forks, local builds, and pull requests to this repository are welcome. Independent reuse, live deployments of copies, and redistribution outside that contribution path are not allowed until the planned MIT relicensing after Base mainnet. See [`LICENSE.md`](LICENSE.md) and [`NDR-0004`](docs/ndr/0004-source-available-until-mainnet.md).

The contribution guide is in [`CONTRIBUTING.md`](CONTRIBUTING.md). In short:

1. Follow existing docs. Do not invent protocol economics, issuance, or governance.
2. Keep contract, web, and keeper changes in their own trees.
3. Match the tests and formatters already used in that tree.
4. Record new design choices as NDRs. Sequence implementation work in NIPs. Do not silently rewrite accepted NDRs.
5. Use Conventional Commits (`feat`, `fix`, `docs`, `chore`, …).

Agents contributing to this repository should also follow [`AGENTS.md`](AGENTS.md).

## License

Original Nether source is **source-available and proprietary** until successful Base mainnet deployment (protocol spec milestone M2), then MIT. Third-party code in `contracts/lib/` keeps its own licenses.

See [`LICENSE.md`](LICENSE.md).

## Disclaimer

Nether is experimental monetary infrastructure. Burial is irreversible. NETH has no guaranteed price, peg, floor, or redemption value. Capital is at high risk; you may lose some or all of it. The software is provided “as is,” without warranty. Use Nether entirely at your own risk.
