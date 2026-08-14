# NDR-0004: Source-available until mainnet, then MIT

- Status: Accepted
- Date: 2026-08-14
- Supersedes: (none)
- Superseded by: (none)

This record is **accepted**. Original Nether source stays proprietary and
source-available until successful Base mainnet deployment, then is relicensed
to MIT. Until then, forks and pull requests to this repository are allowed;
independent reuse is not. `LICENSE.md` includes an MIT-style as-is disclaimer.

## Context

The protocol spec does not name a software license. [`NIP-0001`](../nip/0001-scaffolding.md)
used `MIT` SPDX on new Solidity files as a W0 convenience, explicitly deferring
a later docs change.

Nether’s repository is public so the protocol can be read. The project wants
that visibility without granting a general right to reuse, deploy copies, or
redistribute original Nether source until the monetary contracts are deployed
and running on Base. After that deployment, the project will switch to MIT.

A public GitHub workflow still needs forks and pull requests. Copying the
repo, editing a branch, and opening a PR are copy, modify, and distribute, so
the license must grant that path without granting independent product reuse.

Reviewers and testers should see the MIT “AS IS” / no-warranty /
limitation-of-liability text while the code is still proprietary.

Base / BaseScan do not require an OSI-open license to deploy or verify
contracts. Verification accepts “No License” / Solidity `UNLICENSED`.

OpenZeppelin Contracts (MIT) and forge-std (MIT OR Apache-2.0) stay under
their own licenses in `contracts/lib/`. MIT allows proprietary works to depend
on those libraries if their notices are preserved.

## Decision drivers

- Keep the repository readable (source-available) before launch.
- Grant no general right to reuse, deploy a live copy, sublicense, or sell
  original Nether source before production is live.
- Allow forking this repository, local build/test of a fork, and pull
  requests or patches to this project.
- Preserve inbound rights so accepted PRs can later ship under MIT.
- Disclaim warranty in MIT-like language before MIT relicensing.
- Use a Solidity SPDX value that compilers and BaseScan treat as proprietary,
  not as public domain.
- Switch to MIT after a successful Base mainnet deployment, without inventing
  a second open-source license.
- Do not relicense third-party code.

## Options

### Option A: MIT now

Keep the NIP-0001 convenience: `SPDX-License-Identifier: MIT` and an MIT
`LICENSE.md` immediately.

Anyone may use, modify, and deploy copies of original Nether source before
mainnet. Includes the as-is disclaimer.

### Option B: Business Source License 1.1

Use BUSL-1.1 (BaseScan lists it). Source is available; production use is
restricted until a calendar Change Date, when the code becomes a chosen
open-source license.

Change Date is a date, not “after successful mainnet deploy.” BUSL also
grants non-production use by default.

### Option C: SPDX `UNLICENSED` until M2, with contribution grant (chosen)

Original Nether source is proprietary until successful Base mainnet
deployment (spec M2), then MIT. Solidity SPDX is `UNLICENSED` (proprietary /
no general license granted).

Until relicensing, `LICENSE.md` grants only:

- fork and clone this repository;
- copy and modify original Nether source in that fork;
- local build and test of that fork;
- pull requests or patches to this repository.

It does not grant independent deployment, use in another project,
sublicensing, or sale. Contributors license submissions under these terms
and under MIT after relicensing. The file includes an MIT-style as-is
disclaimer.

Third-party `contracts/lib/` licenses are unchanged.

### Option D: Private repository until deploy

Make the repo private until mainnet, then publish under MIT.

Conflicts with a public spec, public landing/docs site, and source-available
inspection.

### Option E: Split licenses

MIT (or more permissive) for tests, docs, and the website; proprietary only
for production contracts.

More bookkeeping; “the source code” in this decision is the original Nether
tree, not only `contracts/src/`.

### Option F: All rights reserved, no fork or PR grant

Same proprietary-until-M2 policy as Option C, but no permission to copy,
modify, or distribute. Forks and PRs would be unlicensed.

### Option G: Separate contributor license agreement

Keep all-rights-reserved terms and require a signed CLA for PRs.

Heavier process than stating the inbound grant in `LICENSE.md`.

## Decision

Chosen option: **Option C**, because it is source-available-but-not-free
until the contracts are on Base, then MIT, while still allowing the GitHub
contribution path and an as-is disclaimer.

- Option A is free software immediately, which this record rejects until M2.
- Option B is the usual “open later” form, but its Change Date and default
  non-production grant are not the trigger or the restriction asked for.
- Option D hides the source, which is not required and fights the public
  docs/site.
- Option E splits the tree without a stated need; a single original-work
  policy is enough.
- Option F blocks forks and PRs on a public repository.
- Option G adds ceremony `LICENSE.md` can cover.

`UNLICENSED` is Solidity’s documented tag for proprietary source. It is not
the Unlicense. On BaseScan, verify as **No License (None)**.

Relicensing trigger: successful production deployment of the Nether monetary
contracts on Base mainnet (spec milestone M2). Sepolia redeploys do not
trigger MIT. The MIT switch is a commit that replaces `LICENSE.md` and Nether
SPDX identifiers; that commit implements this NDR and does not need a new
one. Declining to relicense after M2 would need a superseding NDR.

## Consequences

- Original Nether Solidity uses `// SPDX-License-Identifier: UNLICENSED`.
- Root [`LICENSE.md`](../../LICENSE.md) states the contribution permission,
  inbound grant, as-is disclaimer, and the M2 MIT plan.
- Independent deployment, product reuse, sublicensing, and sale stay
  forbidden until MIT relicensing.
- [`NIP-0001`](../nip/0001-scaffolding.md) SPDX convenience is superseded by
  this record.
- OpenZeppelin and forge-std remain MIT / MIT OR Apache-2.0.
- After M2, change SPDX to `MIT` and replace `LICENSE.md` with the MIT
  License text.
