# NDR-0007: Resolve Aave Pool via PoolAddressesProvider

- Status: Accepted
- Date: 2026-08-14
- Supersedes: (none)
- Superseded by: (none)

This record is **accepted**. It revises only how W5 finds the Aave V3 **Pool**. The venue in [`NDR-0006`](0006-aave-v3-weth-adapter.md) is unchanged. Treat NDR-0006’s sentences that store Pool as an immutable and forbid reading the provider at runtime as replaced by this record.

## Context

Aave documents PoolAddressesProvider as the market registry: `getPool()` is how integrators are supposed to obtain the Pool proxy. Implementation upgrades happen behind that proxy; `getPool()` still returns it.

[`NDR-0006`](0006-aave-v3-weth-adapter.md) verified `provider.getPool()` once in the constructor, then stored Pool and never read the provider again. That pin is not what Aave’s integration path is, and it duplicates a pointer the provider already owns.

The adapter still must not follow a **replaced** Pool proxy while it holds aTokens from the old one (NAV would desync; a new pool could take deposits without Nether’s 14-day delay).

## Decision drivers

- Call the Pool Aave currently registers for this market, not a copy of the address in Nether storage.
- Implementation upgrades behind the same proxy must apply without a Grave migration.
- Aave governance retargeting `getPool()` to a different proxy must not silently move Grave ETH or bypass spec §6.5’s 14-day delay.
- aWETH remains the NAV source ([`NDR-0006`](0006-aave-v3-weth-adapter.md)); it is tied to one Pool.

## Options

### Option A: Store Pool (NDR-0006 constructor pin)

Constructor: `require(provider.getPool() == pool_)`; immutables include Pool; provider is discarded. Implementation upgrades still hit the same proxy. A new Pool proxy requires a 14-day adapter migration.

### Option B: `getPool()` at every use; store provider only (chosen)

Immutables: Grave, PoolAddressesProvider, WETH, aWETH. No Pool storage. `depositETH` / `withdrawETH` call `provider.getPool()` and use that address. Constructor checks `aToken.POOL() == provider.getPool()` and `aToken.UNDERLYING_ASSET_ADDRESS() == weth`.

On each mutating call, require `provider.getPool() == aToken.POOL()`. If Aave registers a new proxy, the adapter reverts until Grave migrates (14 days) to an adapter constructed with the new aToken.

### Option C: `getPool()` with no aToken check

Same as B without the `aToken.POOL()` match. A provider retarget would `supply` into a new pool while `totalAssetsInETH` still reads the old aToken.

## Decision

Chosen option: **Option B**, because it is Aave’s lookup path and still refuses a replaced Pool while this adapter’s aTokens live on the previous proxy.

- Option A works for in-place proxy upgrades but ignores the registry Aave tells integrators to use.
- Option C follows a retargeted Pool without a Nether migration and breaks NAV.

Working `getPool()` on Base V3 Core remains `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` until W6 re-verifies. That value is a test/deploy expectation, not adapter storage.

## Consequences

- [`NIP-0007`](../nip/0007-aave-adapter.md) constructor takes provider, not Pool. Runtime Pool is `IPoolAddressesProvider(provider).getPool()`.
- WETH and aWETH stay immutables. Do not resolve aToken by decoding `ReserveData` (layout changes across Aave V3.x).
- Fork tests may retarget a mock provider and must see `depositETH` / `withdrawETH` revert when `getPool() != aToken.POOL()`.
- Aave in-place `setPoolImpl` does not change `getPool()`; no Grave migration is required for that.

What would trigger a superseding NDR: storing Pool again; following `getPool()` without the aToken match; or resolving aToken dynamically from Pool structs.
