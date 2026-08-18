# Contributing to Nether

Thank you for helping improve Nether. This repository is public so the protocol can be inspected. Until Base mainnet relicensing, contributions are welcome as forks and pull requests back here — not as independent products. The legal terms are in [`LICENSE.md`](LICENSE.md).

By submitting a contribution, you grant the Nether authors a perpetual, worldwide, royalty-free license to use, modify, and distribute it under the current license and, after the planned relicensing, under the MIT License.

## Source of truth

1. Follow existing documentation. Do not invent protocol behavior, economics, or process that contradicts it.
2. The primary specification is [`docs/protocol_spec.md`](docs/protocol_spec.md). Treat sections 1–21 as requirements. Section 22 lists what an implementation may and must not change.
3. Sequence implementation from living [Nether Implementation Plans](docs/nip/) (NIPs). NIPs are engineering plans, not protocol rules. The spec wins if they disagree.
4. Document **new** decisions in immutable [Nether Decision Records](docs/ndr/) (NDRs). Do not silently overwrite prior decisions.

If documentation and code disagree, ask which one is authoritative before “fixing” either.

Do not guess on protocol economics, invariants, deployment assumptions, public naming, or whether to change existing docs versus recording a new NDR.

## Repository layout

The trees are isolated. Do not add a root `package.json` or mix Solidity into the web/keeper trees.

| Tree | Purpose | Local README |
|---|---|---|
| `contracts/` | Foundry / Solidity | [`contracts/README.md`](contracts/README.md) |
| `apps/web/` | Landing, Learn, docs portal, Grave dashboard | [`apps/web/README.md`](apps/web/README.md) |
| `apps/keeper/` | Gravekeeper cranker | [`apps/keeper/README.md`](apps/keeper/README.md) |
| `docs/` | Spec, NDRs, NIPs | — |

Clone with `--recurse-submodules`. Contract dependencies live in `contracts/lib/` as git submodules.

## Development

Run commands from the tree you are changing.

**Contracts** (Foundry; default `forge test` excludes `test/fork/**`):

```text
cd contracts
forge fmt --check
forge build
forge test
```

Fork tests need `BASE_RPC_URL`. See [`contracts/README.md`](contracts/README.md) and `contracts/.env.example`. Do not commit RPC URLs, private keys, or mnemonics.

**Web** (Node 22):

```text
cd apps/web
npm ci
npm test
npm run dev
```

**Keeper** (Node 22):

```text
cd apps/keeper
npm ci
npm run check
npm test
```

## Pull requests

- Open PRs against `master`.
- Keep the change focused. Do not mix unrelated refactors into a protocol or docs fix.
- Use Conventional Commits in the PR title and commit messages (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`).
- Include tests for behavior you change. Match the style of neighboring tests.
- Run the checks for the trees you touched before asking for review.
- Do not add generated icons or substitute graphics. Use an existing icon pack already in the tree (Lucide on the web app) or ask for an asset.
- Do not include agent attribution in commits, comments, or PR text.

## Documentation changes

- Spec sections 1–21 are protocol requirements. Do not reinterpret era math, burial finality, Reaper economics, yield allocation, or other invariants in a “drive-by” PR.
- Edit a NIP when the engineering plan for an in-flight or living workstream needs to change. NIPs may be updated as work proceeds.
- Open a new NDR when the work requires a choice that is not already settled by the spec or an existing NDR and that choice will constrain later work. Copy [`docs/ndr/template.md`](docs/ndr/template.md). Record all considered options, the drivers, the chosen option, and why.
- After an NDR is accepted, do not edit its decision body. Supersede it with a new NDR if the decision must change.
- Do not write an NDR for typos, restoring documented behavior, or dependency bumps with no design choice.

## Questions

Use [Discord](https://discord.gg/N9mTHr5VE) for discussion and [X](https://x.com/netherprotocol) for protocol updates. GitHub issues and pull requests are for concrete repository work.

Agents (and humans following the same workflow) should read [`AGENTS.md`](AGENTS.md) as well.
