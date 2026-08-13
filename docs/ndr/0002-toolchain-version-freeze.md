# NDR-0002: Toolchain version freeze

- Status: Proposed
- Date: 2026-08-13
- Supersedes: (none)
- Superseded by: (none)

This record is a **draft**. It is not accepted and does not freeze production bytecode. W0 may install these versions as the working set ([`NIP-0001`](../nip/0001-scaffolding.md)). Spec §18.3 freeze happens when this NDR is accepted, which may wait until late M0 / before M2. Versions in the table may be revised while status remains Proposed (for example if a patch release of solc, OpenZeppelin, or Foundry ships). Acceptance locks the table; a later bump requires a new NDR.

## Context

[`protocol_spec.md`](../protocol_spec.md) §18.3 requires a freeze of compiler, dependencies, and OpenZeppelin versions before production deployment. §4.1 and §10.2 recommend OpenZeppelin Contracts 5.x. §17 requires Foundry unless an equivalent EVM framework is necessary.

The spec does not name patch versions. [`NIP-0000`](../nip/0000-the-roadmap.md) says W0 may pick working versions and that the freeze is an NDR, not an implicit scaffold decision.

This NDR names the versions to freeze. Frontend, indexer, and Gravekeeper stacks are out of scope (frontend draft: [`NDR-0003`](0003-frontend-stack.md); indexer and keeper remain later NDRs).

## Decision drivers

- Reproducible builds and tests across contributors and CI.
- Audited OpenZeppelin 5.x components for ERC-20, access control, pause, and reentrancy, as the spec recommends.
- Solidity releases that still receive 0.8.x fixes, at or above the pragma OpenZeppelin 5.7 requires.
- Bytecode that matches Base mainnet’s current EVM hardfork.
- No Node toolchain inside the Foundry project.
- No upgradeable/proxy libraries, because NETH, Grave, and Reaper are immutable at deploy (§10.1, §11, §21).
- Foundry stable releases over nightlies for a freeze.

## Options

### Option A: Float latest until mainnet week

Leave solc, OpenZeppelin, forge-std, and Foundry unpinned (or pin only major lines such as “5.x” / “stable”). Freeze hastily immediately before M2.

### Option B: Pin Solidity and OpenZeppelin only

Pin `solc` and `@openzeppelin/contracts` / `openzeppelin-contracts`. Let Foundry and forge-std float with `foundry-toolchain` `version: stable`.

### Option C: Pin the full Foundry-native set (chosen)

Pin solc, EVM version, optimizer baseline, OpenZeppelin Contracts, forge-std, and Foundry stable. Install OZ and forge-std with `forge install` submodules and `foundry.lock`. Do not install `openzeppelin-contracts-upgradeable` or npm copies of OZ for the contract tree.

### Option D: npm OpenZeppelin plus Foundry

Add a `package.json` under `contracts/` (or the repo root) and import `@openzeppelin/contracts` from `node_modules`.

### Option E: Older long-lived pins

Use Solidity 0.8.24 (OZ 5.7’s raised minimum on several modules) or 0.8.28 (common Foundry examples) and an earlier OpenZeppelin 5.x (5.0–5.4).

## Decision

Chosen option: **Option C**, because it is what §18.3 asks for (compiler, dependencies, OpenZeppelin) with a Foundry-native install path and an explicit Base EVM version.

- Option A leaves M0 tests and any early audit artifacts on a moving compiler.
- Option B still lets cheatcodes, fuzzing, and `forge fmt` change under the tests that M0 must keep green.
- Option D mixes a Node environment into `contracts/`, which [`NIP-0001`](../nip/0001-scaffolding.md) forbids.
- Option E forgoes current 0.8.x compiler fixes and current OZ 5.x patches without a spec reason to stay old.

Proposed freeze table (as of 2026-08-13):

| Component | Version | Source |
|---|---|---|
| Solidity (`solc`) | `0.8.36` | [v0.8.36](https://github.com/argotorg/solidity/releases/tag/v0.8.36) (latest 0.8.x) |
| `foundry.toml` `evm_version` | `osaka` | Base Azul (mainnet 2026-05-28) enabled Osaka |
| Optimizer | `true`, `optimizer_runs = 200`, `via_ir = false` | Foundry/solc defaults; compact enough for the §18 deploy budget until W6 measures otherwise |
| OpenZeppelin Contracts | `v5.7.0` | [v5.7.0](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.7.0) (latest 5.x) |
| forge-std | `v1.16.2` | [v1.16.2](https://github.com/foundry-rs/forge-std/releases/tag/v1.16.2) |
| Foundry (`forge` / `cast` / `anvil`) | `v1.7.1` | Latest stable Foundry release; nightlies are not part of this freeze |
| `foundry-rs/foundry-toolchain` | `@v1` action, `version: v1.7.1` | CI must not use `nightly` |

Install refs:

```text
forge install foundry-rs/forge-std@v1.16.2
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0
```

`pragma` on Nether sources: `pragma solidity 0.8.36;` (exact, not `^`). `auto_detect_solc = false`.

Not in this freeze: frontend (see Proposed [`NDR-0003`](0003-frontend-stack.md)), indexer, Gravekeeper, AAVE adapter addresses, or optimizer_runs retunes after a measured W6 size/gas problem (that retune would supersede this NDR if it must change the frozen compiler settings).

## Consequences

- W0 ([`NIP-0001`](../nip/0001-scaffolding.md)) installs this working set.
- Until status is Accepted, a patch bump stays a Proposed-table edit. After Accepted, a bump is a new NDR.
- CI on `contracts/` uses Foundry `v1.7.1` and recursive submodules.
- `openzeppelin-contracts-upgradeable` and other ERC-20 implementations are out of the contract tree.
- Accepting this NDR is a production gate for M2, not a gate for starting W0 or W1.
