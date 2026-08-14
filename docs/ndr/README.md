# Nether Decision Records (NDRs)

NDRs are immutable records of design decisions for Nether. They exist so agents and humans can follow existing documentation instead of re-litigating or silently rewriting choices.

## When to write one

Write an NDR when the work requires a choice that is **not** already settled by [`docs/protocol_spec.md`](../protocol_spec.md) or an existing NDR, and the choice will constrain later work.

Examples: contract boundaries, strategy adapter selection, testing standards, upgrade/ops policy, public APIs, toolchain version freeze, repo conventions that are not obvious from the spec.

Living engineering sequence lives in [NIPs](../nip/README.md), not here.

Do not write an NDR for restoring behavior the spec already requires, or for purely mechanical edits.

## Rules

1. **Follow existing docs first.** If the spec or an NDR already decides the matter, implement that. Do not open a competing record.
2. **Describe the decision, not only the outcome.** Every NDR must include all considered options, the decision drivers, the chosen option, and why that option was chosen.
3. **Immutable body.** After an NDR is accepted, do not edit its context, options, or rationale. Correcting typos in titles or fixing a broken link is allowed. Changing the decision is not: write a new NDR that supersedes the old one and set the old status to `Superseded`.
4. **Ask if unsure.** If drivers are incomplete, options are missing, or the user has not indicated a preference, ask before accepting an NDR.

## File layout

```
docs/ndr/
  README.md              this index
  template.md            copy this
  NNNN-short-title.md    one NDR per file
```

- `NNNN` is a four-digit number, starting at `0001`, never reused.
- `short-title` is lowercase kebab-case.
- Status values: `Proposed`, `Accepted`, `Superseded`, `Rejected`.

## Index

| NDR | Title | Status |
|---|---|---|
| [0001](0001-adopt-immutable-ndrs.md) | Adopt immutable Nether Decision Records | Accepted |
| [0002](0002-toolchain-version-freeze.md) | Toolchain version freeze | Proposed |
| [0003](0003-frontend-stack.md) | Frontend stack | Accepted |
| [0004](0004-source-available-until-mainnet.md) | Source-available until mainnet, then MIT | Accepted |
| [0005](0005-strategy-security.md) | Strategy replacement security | Accepted |
| [0006](0006-aave-v3-weth-adapter.md) | Initial production strategy adapter (Aave V3 WETH) | Accepted |
| [0007](0007-aave-pool-via-provider.md) | Resolve Aave Pool via PoolAddressesProvider | Accepted |
