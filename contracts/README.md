# contracts

Foundry workspace for Nether’s Solidity. See [`docs/nip/0001-scaffolding.md`](../docs/nip/0001-scaffolding.md).

Do not add Node, Python, or other app toolchains here.

Default `forge test` excludes `test/fork/**`. Those suites talk to live Base Aave and need `BASE_RPC_URL` (see `.env.example`). Copy it into `.env` locally; do not commit RPC URLs. Family-level protocol e2e lives in `test/fork/ProtocolE2E.t.sol`, still behind `BASE_RPC_URL`.

```text
forge test --match-path 'test/fork/**' --fork-url "$BASE_RPC_URL"
```

or `FOUNDRY_PROFILE=fork forge test` with `BASE_RPC_URL` set so the `base` RPC endpoint in `foundry.toml` resolves.

## Deploy

`script/deploy.sh` deploys NETH, Grave, Reaper, and the Aave V3 WETH adapter on Base or Base Sepolia, then wires the family (`setGrave`, `setReaper`, `scheduleStrategy`, and `executeStrategyMigration` for the first adapter). Progress is written to `deployments/<network>.json` so a run can be resumed after an RPC drop or a wallet switch.

```text
./script/deploy.sh --network base-sepolia --rpc-url "$BASE_SEPOLIA_RPC_URL" --account <keystore>
./script/deploy.sh --network base --rpc-url "$BASE_RPC_URL" --ledger --confirm-mainnet
./script/deploy.sh --network base-sepolia --redeploy
./script/deploy.sh --network base-sepolia --status
```

Switch RPC with `--rpc-url` (HTTPS URL or Foundry alias `base` / `base_sepolia`). Switch the signer per run with `--account`, `--ledger`, `--trezor`, or `DEPLOYER_PRIVATE_KEY` in the environment; the state file never stores keys. Override Aave pins with `--aave-config` or `WETH` / `AAVE_POOL_ADDRESSES_PROVIDER` / `AAVE_POOL` / `AAVE_AWETH`.

The first adapter executes in the same run while `activeStrategy` is unset ([NDR-0008](../docs/ndr/0008-initial-strategy-immediate.md)). Replacing a live adapter still requires Grave’s 14-day delay. Sepolia may iterate with `--redeploy`. Mainnet broadcasts require `--confirm-mainnet` and abort if the remaining setup is estimated above USD 15 (`ETH_USD_PRICE`, spec §18).

The wrapper looks for `forge` / `cast` on `PATH` and in `~/.foundry/bin` (Foundry’s default install on macOS, which a bash script does not inherit from zsh). Override the location with `FOUNDRY_BIN` if needed.

See `./script/deploy.sh --help`.
