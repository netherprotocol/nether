# NDR-0005: Contribution grant and as-is terms until MIT

- Status: Accepted
- Date: 2026-08-14
- Supersedes: NDR-0004
- Superseded by: (none)

This record is **accepted**. It keeps NDR-0004’s source-available-until-M2
policy and adds a limited fork/PR grant plus an MIT-style warranty disclaimer.

## Context

[`NDR-0004`](0004-source-available-until-mainnet.md) made original Nether source
proprietary until successful Base mainnet deployment, then MIT. Its terms
granted no right to copy, modify, or distribute.

A public GitHub workflow needs forks and pull requests. Copying the repo,
editing a branch, and opening a PR are copy, modify, and distribute. NDR-0004
therefore blocked the contribution path it did not intend to close.

The project also wants the MIT “AS IS” / no-warranty / limitation-of-liability
text while the code is still proprietary, so reviewers and testers are not
owed a fitness guarantee.

## Decision drivers

- Keep original Nether source not-free until M2 (no independent deploy or
  reuse in other products).
- Allow forking this repository and submitting PRs or patches to it.
- Allow local build and test of a fork for that contribution path.
- Disclaim warranty in MIT-like language before MIT relicensing.
- Preserve inbound rights so accepted PRs can later ship under MIT.
- Leave third-party `contracts/lib/` licenses unchanged.

## Options

### Option A: Keep NDR-0004 terms unchanged

All rights reserved, no copy/modify/distribute. Forks and PRs remain
unlicensed.

### Option B: Add a contribution grant and as-is disclaimer (chosen)

Same proprietary-until-M2 policy as NDR-0004, plus:

- permission to fork, modify, locally build/test, and send PRs/patches to
  this repository only;
- no permission to deploy a live copy, use the code in another project,
  sublicense, or sell it;
- contributors license their submissions under these terms and under MIT
  after relicensing;
- MIT-style “AS IS” warranty disclaimer and limitation of liability.

### Option C: MIT now

Full MIT immediately, including warranty disclaimer. Also grants reuse and
independent deployment before mainnet.

### Option D: Contributor License Agreement (separate CLA)

Keep NDR-0004’s all-rights-reserved text and require a signed CLA for PRs.

Heavier process than a grant in `LICENSE.md`.

## Decision

Chosen option: **Option B**, because forks and PRs are the intended way to
change a public repo, and they were accidentally forbidden. The as-is clause
is the MIT disclaimer without the MIT grant of general reuse.

- Option A leaves GitHub contributions outside the license.
- Option C restores free software before M2.
- Option D adds ceremony the project does not need while `LICENSE.md` can
  state the inbound grant.

SPDX remains `UNLICENSED` until M2. Relicensing trigger remains successful
Base mainnet deployment (spec M2), as in NDR-0004.

## Consequences

- [`LICENSE.md`](../../LICENSE.md) includes the contribution permission, inbound
  grant, and MIT-style no-warranty text.
- Independent deployment, product reuse, sublicensing, and sale stay
  forbidden until MIT relicensing.
- [`NIP-0001`](../nip/0001-scaffolding.md) continues to point at this license
  policy for SPDX.
- After M2, replace `LICENSE.md` with the MIT License and change Nether SPDX
  to `MIT`.
