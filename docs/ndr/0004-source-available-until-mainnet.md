# NDR-0004: Source-available until mainnet, then MIT

- Status: Accepted
- Date: 2026-08-14
- Supersedes: (none)
- Superseded by: (none)

This record is **accepted**. Original Nether source stays proprietary and
source-available until successful Base mainnet deployment, then is relicensed
to MIT.

## Context

The protocol spec does not name a software license. [`NIP-0001`](../nip/0001-scaffolding.md)
used `MIT` SPDX on new Solidity files as a W0 convenience, explicitly deferring
a later docs change.

Nether’s repository is public so the protocol can be read. The project wants
that visibility without granting reuse, modification, or redistribution rights
until the monetary contracts are deployed and running on Base. After that
deployment, the project will switch to MIT.

Base / BaseScan do not require an OSI-open license to deploy or verify
contracts. Verification accepts “No License” / Solidity `UNLICENSED`.

OpenZeppelin Contracts (MIT) and forge-std (MIT OR Apache-2.0) stay under
their own licenses in `contracts/lib/`. MIT allows proprietary works to depend
on those libraries if their notices are preserved.

## Decision drivers

- Keep the repository readable (source-available) before launch.
- Grant no general right to reuse, fork-deploy, or redistribute original
  Nether source before production is live.
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
mainnet.

### Option B: Business Source License 1.1

Use BUSL-1.1 (BaseScan lists it). Source is available; production use is
restricted until a calendar Change Date, when the code becomes a chosen
open-source license.

Change Date is a date, not “after successful mainnet deploy.” BUSL also
grants non-production use by default.

### Option C: SPDX `UNLICENSED` until M2, then MIT (chosen)

All rights reserved on original Nether source. Solidity SPDX is `UNLICENSED`
(proprietary / no license granted). After successful Base mainnet deployment
(spec M2), relicense original Nether source to MIT and change SPDX to `MIT`.

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

## Decision

Chosen option: **Option C**, because it matches source-available-but-not-free
until the contracts are on Base, then MIT, without a calendar BUSL Change Date
and without granting reuse before launch.

- Option A is free software immediately, which is what this record rejects
  until M2.
- Option B is the usual “open later” form, but its Change Date and default
  non-production grant are not the trigger or the restriction asked for.
- Option D hides the source, which is not required and fights the public
  docs/site.
- Option E splits the tree without a stated need; a single original-work
  policy is enough.

`UNLICENSED` is Solidity’s documented tag for proprietary source. It is not
the Unlicense. On BaseScan, verify as **No License (None)**.

Relicensing trigger: successful production deployment of the Nether monetary
contracts on Base mainnet (spec milestone M2). Sepolia redeploys do not
trigger MIT. The MIT switch is a commit that replaces `LICENSE.md` and Nether
SPDX identifiers; that commit implements this NDR and does not need a new
one. Declining to relicense after M2 would need a superseding NDR.

## Consequences

- Original Nether Solidity uses `// SPDX-License-Identifier: UNLICENSED`.
- Root [`LICENSE.md`](../../LICENSE.md) states all-rights-reserved terms and
  the M2 MIT plan.
- [`NIP-0001`](../nip/0001-scaffolding.md) SPDX convenience is superseded by
  this record.
- OpenZeppelin and forge-std remain MIT / MIT OR Apache-2.0.
- After M2, change SPDX to `MIT` and replace `LICENSE.md` with the MIT
  License text.
