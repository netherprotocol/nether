# Deployment state

`*.json` files in this directory are written by `script/deploy.sh` / `DeployProtocol.s.sol`.

They record contract addresses and completed wiring steps so a run can be resumed after an RPC drop or a wallet switch. They do not contain private keys.

Default paths:

- `base.json` — Base mainnet (8453)
- `base-sepolia.json` — Base Sepolia (84532)

Sepolia redeploys archive the previous file as `base-sepolia.<UTC timestamp>.json` and start a new family. Mainnet redeploys are refused.
