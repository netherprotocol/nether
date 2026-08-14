# License

Copyright (c) 2026 the Nether authors. All rights reserved.

Original Nether source in this repository is **source-available and proprietary**.
It is published so the protocol can be inspected. It is not free software.

## Contribution permission

You may, without further permission:

1. Fork and clone this repository.
2. Copy and modify original Nether source in that fork.
3. Build and test that fork locally.
4. Submit pull requests or patches to this repository.

Those permissions are only for inspecting this protocol and contributing
changes back to this project.

They do **not** allow you to deploy original Nether source (or a modified
copy) as a live protocol or product, use it in another project, sublicense
it, sell it, or distribute it except as a fork of this repository or as a
pull request or patch to this repository.

## Contributions

By submitting a contribution to this repository, you grant the Nether authors
a perpetual, worldwide, royalty-free license to use, modify, and distribute
your contribution under this license and, after the planned relicensing,
under the MIT License.

## No warranty

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

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
