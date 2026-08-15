import { pathToFileURL } from 'node:url';
import { ConfigError, loadConfig, type KeeperConfig } from './config.js';
import { nextPollDelayMs, type Policy } from './plan.js';
import { runTick, type CrankState, type Logger } from './crank.js';
import { openGasLog } from './gasLog.js';
import { assertChainId, assertReaperMatch, createViemPort } from './viemPort.js';

export const HELP = `Nether Grave keeper — permissionless cranker for harvest(), startAuction(), and finalizeAuction().

The keeper is not a privileged role. It pays its own gas from the operator EOA
(never from protected principal) and skips dust harvests and auctions by default
when the ETH moved would not cover estimated Base gas (L2 execution plus OP-stack
L1 data fee). Finalize of an expired auction is never skipped for dust.

Usage:
  node dist/index.js [once|watch] [flags]
  node dist/index.js --help

  once    Run one tick and exit 0 (default). Skipping is success.
  watch   Loop until SIGINT or SIGTERM.

Flags (env in parentheses):
  --rpc-url             NETHER_RPC_URL           required, HTTP(S)
  --chain-id            NETHER_CHAIN_ID          required, 8453 | 84532 | base | baseSepolia
  --grave               NETHER_GRAVE             required
  --reaper              NETHER_REAPER            required
  --private-key         NETHER_PRIVATE_KEY       required except --dry-run (prefer env)
  --dry-run                                      views + simulate + estimate; never sends
  --poll-ms             NETHER_POLL_MS           watch poll cap, default 60000
  --min-harvest-wei     NETHER_MIN_HARVEST_WEI   default 0
  --min-auction-wei     NETHER_MIN_AUCTION_WEI   default 0
  --min-size-to-fee     NETHER_MIN_SIZE_TO_FEE   default 1 (0 disables the fee comparison)
  --gas-log             NETHER_GAS_LOG           default keeper-gas.jsonl
`;

export function policyFromConfig(config: KeeperConfig): Policy {
  return {
    minSizeToFee: config.minSizeToFee,
    minHarvestWei: config.minHarvestWei,
    minAuctionWei: config.minAuctionWei,
  };
}

export function createStdLogger(): Logger {
  return {
    info: (line) => console.log(line),
    warn: (line) => console.error(line),
    error: (line) => console.error(line),
  };
}

export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function run(config: KeeperConfig, log: Logger = createStdLogger()): Promise<void> {
  const port = createViemPort(config);
  await assertChainId(port.publicClient, config.chainId);
  await assertReaperMatch(port.publicClient, config.grave, config.reaper);

  const store = openGasLog(config.gasLog);
  const state: CrankState = { lastFeeWei: 0n };
  const tickOpts = {
    port,
    policy: policyFromConfig(config),
    store,
    log,
    dryRun: config.dryRun,
    chainId: config.chainId,
    hasOperator: config.privateKey !== undefined,
    state,
  };

  if (config.mode === 'once') {
    await runTick(tickOpts);
    return;
  }

  const abort = new AbortController();
  const stop = () => abort.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    while (!abort.signal.aborted) {
      const { snapshot } = await runTick(tickOpts);
      if (abort.signal.aborted) {
        break;
      }
      await sleep(nextPollDelayMs(snapshot, config.pollMs), abort.signal);
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(HELP);
    return;
  }
  await run(config);
}

function isDirectRun(): boolean {
  const invoked = process.argv[1];
  if (!invoked) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(invoked).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((err) => {
    const message = err instanceof ConfigError || err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
  });
}
