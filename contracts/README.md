# contracts

Foundry workspace for Nether’s Solidity. See [`docs/nip/0001-scaffolding.md`](../docs/nip/0001-scaffolding.md).

Do not add Node, Python, or other app toolchains here.

Default `forge test` excludes `test/fork/**`. Those suites talk to live Base Aave and need `BASE_RPC_URL` (see `.env.example`). Copy it into `.env` locally; do not commit RPC URLs. Family-level protocol e2e lives in `test/fork/ProtocolE2E.t.sol`, still behind `BASE_RPC_URL`.

```text
forge test --match-path 'test/fork/**' --fork-url "$BASE_RPC_URL"
```

or `FOUNDRY_PROFILE=fork forge test` with `BASE_RPC_URL` set so the `base` RPC endpoint in `foundry.toml` resolves.
