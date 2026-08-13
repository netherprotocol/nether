# NIP-0001: Repository scaffolding

- Status: Ready to implement
- Date: 2026-08-13
- Workstream: W0
- Roadmap: [`0000-the-roadmap.md`](0000-the-roadmap.md)
- Source of truth: [`protocol_spec.md`](../protocol_spec.md)
- Working versions: Proposed [`NDR-0002`](../ndr/0002-toolchain-version-freeze.md) (not accepted)

This plan is the W0 breakdown. It does not implement protocol logic and does not freeze compiler or library versions. Those versions freeze when NDR-0002 is accepted (spec §18.3).

## 1. Purpose

Unblock W1–W8 with a Foundry workspace, pinned *working* toolchain, formatting, CI, and a repository shape that keeps Solidity, the landing/dashboard, and the Gravekeeper in separate environments.

## 2. Scope

In scope:

- Root README and ignore rules
- Isolated directory trees for contracts, web, and keeper
- Foundry project under `contracts/`
- OpenZeppelin Contracts 5.x and forge-std as git submodules
- `foundry.toml`, remappings, formatter
- GitHub Actions that run `forge fmt --check`, `forge build`, and `forge test` from `contracts/`
- Spec `IStrategyAdapter` as the only production Solidity file (verbatim from §6.4)

Out of scope:

- NETH, Grave, Reaper, era math, harvest, auctions
- Frontend framework, indexer, or keeper language
- Proxy / upgradeability scaffolding
- `openzeppelin-contracts-upgradeable`, Solady, Solmate, or other extra Solidity libraries
- Production deploy scripts (W6)
- Accepting NDR-0002

## 3. Isolated environments

Do not put Node, Python, or other app toolchains inside the Foundry tree, and do not put Solidity inside the web or keeper trees.

There is **no** root `package.json`, `pnpm-workspace.yaml`, or `requirements.txt` that joins these trees. Each tree owns its own manifest when that workstream starts.

```
.
├── AGENTS.md
├── README.md
├── contracts/                 Foundry only (W0+)
│   ├── foundry.toml
│   ├── remappings.txt
│   ├── src/
│   ├── test/
│   ├── script/
│   └── lib/                   git submodules
├── apps/
│   ├── web/                   landing + dashboard (W7)
│   └── keeper/                Gravekeeper (W8)
└── docs/
    ├── protocol_spec.md
    ├── ndr/
    └── nip/
```

| Tree | Runtime | First workstream | Stack now |
|---|---|---|---|
| `contracts/` | Foundry / solc | W0 | This NIP + Proposed NDR-0002 |
| `apps/web/` | JavaScript/TypeScript (expected) | W7 | TBD; NDR when chosen |
| `apps/keeper/` | Own runtime | W8 | TBD; NDR when chosen |
| `docs/` | Markdown | ongoing | — |

Landing and dashboard are two surfaces and one frontend environment (`apps/web/`). Split that tree later only if W7 needs two independent apps. Do not mix it with `contracts/` or `apps/keeper/`.

W0 creates `apps/web/` and `apps/keeper/` as stubs with a short README each. Do not add their package managers until W7/W8.

## 4. Contract tree (Foundry defaults)

Follow Foundry’s default layout inside `contracts/`, not at the repository root. Run `forge` with that directory as the project root (CI `working-directory: contracts`).

```
contracts/
├── foundry.toml
├── remappings.txt
├── src/
│   ├── interfaces/
│   │   └── IStrategyAdapter.sol
│   ├── libraries/             EraMath in W2; empty in W0
│   └── strategy/              production adapters in W5+; empty in W0
├── test/
│   ├── unit/                  W1+
│   ├── fuzz/                  W1+
│   ├── invariant/             W2+/W4+
│   ├── fork/                  W5+/W6
│   └── mocks/                 test invest adapter in W4; never deploy
├── script/                    W6 deploy kit; empty placeholder in W0
└── lib/
    ├── forge-std/
    └── openzeppelin-contracts/
```

Production contracts arrive in later workstreams, as separate files, matching spec §11:

| File | Workstream | Notes |
|---|---|---|
| `src/NETH.sol` | W1 | OZ ERC-20 + burn; Grave-only mint |
| `src/Grave.sol` | W2, then W4 | Burial/eras first; harvest and strategy slot later |
| `src/libraries/EraMath.sol` | W2 | Pure library |
| `src/Reaper.sol` | W3 | Reverse Dutch auction |
| `src/interfaces/IStrategyAdapter.sol` | W0 (stub), W4 (used) | Exact §6.4 surface |
| `src/strategy/*` | W5 | Production adapter after its NDR |
| `test/mocks/*` | W4 | Test invest adapter only |

Do not merge NETH into Grave, or the production adapter into the strategy interface delivery. Whether `StrategyManager` is a separate deployed contract or a module of Grave is a W4 question; W0 only reserves `src/` and `src/strategy/`.

Delete the `forge init` Counter sample. Do not add `ERC20Pausable` (ordinary transfers must not pause). Do not add proxy helpers.

## 5. Stack (working set)

W0 installs the versions in Proposed NDR-0002. Until that NDR is accepted they are working versions, not the production freeze.

| Piece | Choice | Why |
|---|---|---|
| Language | Solidity 0.8.x, pragma matching the pinned solc | Spec §17, §4.1 |
| Framework | Foundry (`forge`, `cast`, `anvil`) | Spec §17 |
| Token / access / safety | OpenZeppelin Contracts 5.x | Spec §4.1, §10.2 |
| Tests | forge-std | Foundry default |
| Dependency install | `forge install` git submodules + `foundry.lock` | Foundry-native; keeps Node out of `contracts/` |
| Formatter | `forge fmt` | Foundry default |
| CI | GitHub Actions + `foundry-rs/foundry-toolchain` | This repository is GitHub-hosted |
| Target chain (config only) | Base (8453), Base Sepolia (84532) | Spec §3, §18 |

OpenZeppelin modules expected later (do not invent substitutes):

- `ERC20`, `ERC20Burnable` (W1)
- `ReentrancyGuard` (W2–W4)
- `Pausable` on strategy-sensitive operations only (W4), never on NETH transfers
- `Ownable2Step` and/or `AccessControl` for admin handoff (W4)
- `TimelockController` only if W4/W6 cannot reuse already-deployed Base infrastructure (spec §18.2)

Forbidden in this repo unless a later NDR says otherwise:

- OpenZeppelin Contracts Upgradeable, Transparent/UUPS/Beacon proxies, TUP
- Solady, Solmate, PRBMath, or a second ERC-20 implementation
- Hardhat, Ape, Brownie as the primary Solidity toolchain
- npm/`node_modules` as the OpenZeppelin install path for contracts

## 6. Foundry configuration

`contracts/foundry.toml` should pin the compiler (no auto-detect), set the EVM version to Base’s current hardfork, and keep optimizer settings boring until bytecode size becomes a W6 problem.

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
test = "test"
script = "script"
solc_version = "0.8.36"
auto_detect_solc = false
evm_version = "osaka"
optimizer = true
optimizer_runs = 200
via_ir = false
ffi = false

[profile.default.fmt]
line_length = 120
tab_width = 4
bracket_spacing = false

[rpc_endpoints]
base = "${BASE_RPC_URL}"
base_sepolia = "${BASE_SEPOLIA_RPC_URL}"
```

Remapping (OZ docs import path):

```
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
forge-std/=lib/forge-std/src/
```

Install:

```text
forge install foundry-rs/forge-std@v1.16.2
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0
```

Commit `.gitmodules`, `foundry.lock`, and the submodule pointers. CI must check out submodules recursively.

W0 may add a trivial `test/unit/Scaffold.t.sol` that asserts the project compiles. Remove or replace it when W1 lands.

## 7. Ignore rules and secrets

Root `.gitignore` must cover every tree without implying a shared runtime:

```
# Foundry
contracts/out/
contracts/cache/
contracts/broadcast/
contracts/artifacts/

# App environments (when they exist)
**/node_modules/
**/.next/
**/dist/
**/.venv/
**/__pycache__/

.env
.env.*
!.env.example
```

Never commit RPC URLs with embedded credentials, private keys, or mnemonic files. `.env.example` may list `BASE_RPC_URL` and `BASE_SEPOLIA_RPC_URL` names only.

## 8. CI

Add `.github/workflows/contracts.yml`:

- `actions/checkout` with `submodules: recursive`
- `foundry-rs/foundry-toolchain@v1` with `version: v1.7.1` and the GitHub token input (do not float `nightly`)
- `defaults.run.working-directory: contracts`
- `forge fmt --check`
- `forge build --sizes`
- `forge test -vvv`

Do not run frontend or keeper jobs from this workflow. W7/W8 add their own workflows in their own trees.

A later `FOUNDRY_PROFILE=ci` may tighten fuzz runs; W0 can use Foundry defaults.

## 9. Implementation steps

1. Keep the stub READMEs under `contracts/`, `apps/web/`, and `apps/keeper/` (created with this NIP) or replace them in place.
2. `forge init --force --no-commit` inside `contracts/` if needed, then delete Counter samples.
3. Pin forge-std and OpenZeppelin to the Proposed NDR-0002 tags.
4. Write `foundry.toml` and `remappings.txt` as above.
5. Add `src/interfaces/IStrategyAdapter.sol` copied from spec §6.4 (`pragma solidity 0.8.36;` to match the pin).
6. Add root `.gitignore` and contract CI.
7. Confirm `forge fmt --check`, `forge build`, and `forge test` succeed from `contracts/`.

SPDX license on new Solidity files: `MIT`, matching OpenZeppelin, unless a later docs change says otherwise. That is a W0 convenience, not an NDR.

## 10. Acceptance criteria

W0 is done when:

- `forge fmt --check`, `forge build`, and `forge test` pass locally and in CI from `contracts/`
- OpenZeppelin Contracts and forge-std are the versions in Proposed NDR-0002
- No upgradeable/proxy libraries are installed
- `apps/web/` and `apps/keeper/` exist as separate trees with no shared package manifest
- No NETH/Grave/Reaper logic has landed
- NDR-0002 is still Proposed unless it is explicitly accepted in a later change

## 11. Not decided here

Leave these to later NDRs, as queued in [`NIP-0000`](0000-the-roadmap.md):

- Accepting the compiler / OZ / Foundry freeze (NDR-0002)
- Frontend framework and indexer
- Gravekeeper language and runtime
- Initial production strategy (AAVE candidate)
- Any `IStrategyAdapter` surface change
