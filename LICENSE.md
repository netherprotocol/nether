# License

Copyright (c) 2026 the Nether authors. All rights reserved.

Original Nether source in this repository is **source-available and proprietary**.
It is published so the protocol can be inspected. It is not free software.

## Terms

No license is granted to use, copy, modify, merge, publish, distribute,
sublicense, or sell original Nether source, or to deploy copies of it, without
prior written permission from the copyright holder.

Viewing the public repository does not grant those rights.

## Planned relicensing

After the Nether monetary contracts are successfully deployed and operating on
Base mainnet (protocol spec milestone M2), the copyright holder will relicense
original Nether source under the MIT License.

Until that relicensing commit, original Nether Solidity files use:

```text
// SPDX-License-Identifier: UNLICENSED
```

`UNLICENSED` is Solidity’s identifier for proprietary / no-license-granted
source. It is not the Unlicense (public domain).

On relicensing, `LICENSE.md` becomes the MIT License and Nether Solidity SPDX
identifiers change to `MIT`.

## Third-party code

This does not change third-party licenses in `contracts/lib/`:

- OpenZeppelin Contracts remains MIT
- forge-std remains MIT OR Apache-2.0

Those notices must be preserved. Original Nether source may depend on that
code; it does not relicense it.
