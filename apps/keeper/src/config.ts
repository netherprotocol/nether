import path from 'node:path';
import { parseArgs } from 'node:util';
import { getAddress, type Address, type Hex } from 'viem';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type KeeperMode = 'once' | 'watch';

export type KeeperConfig = {
  help: boolean;
  mode: KeeperMode;
  rpcUrl: string;
  chainId: 8453 | 84532;
  grave: Address;
  reaper: Address;
  privateKey: Hex | undefined;
  dryRun: boolean;
  pollMs: number;
  minHarvestWei: bigint;
  minAuctionWei: bigint;
  minSizeToFee: bigint;
  minRecoverWei: bigint;
  gasLog: string;
};

export const DEFAULT_POLL_MS = 60_000;
export const DEFAULT_GAS_LOG = 'keeper-gas.jsonl';
export const BASE_MAINNET = 8453;
export const BASE_SEPOLIA = 84532;

type Env = Record<string, string | undefined>;

export function resolveGasLogPath(raw: string, cwd = process.cwd()): string {
  if (path.isAbsolute(raw)) {
    return raw;
  }
  const parts = raw.split(/[\\/]+/).filter((part) => part !== '' && part !== '.');
  return path.resolve(cwd, ...parts);
}

export function loadConfig(argv: string[], env: Env = process.env): KeeperConfig {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        'rpc-url': { type: 'string' },
        'chain-id': { type: 'string' },
        grave: { type: 'string' },
        reaper: { type: 'string' },
        'private-key': { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        'poll-ms': { type: 'string' },
        'min-harvest-wei': { type: 'string' },
        'min-auction-wei': { type: 'string' },
        'min-size-to-fee': { type: 'string' },
        'min-recover-wei': { type: 'string' },
        'gas-log': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConfigError(message);
  }

  const { values, positionals } = parsed;
  if (values.help) {
    return {
      help: true,
      mode: 'once',
      rpcUrl: '',
      chainId: BASE_MAINNET,
      grave: '0x0000000000000000000000000000000000000000',
      reaper: '0x0000000000000000000000000000000000000000',
      privateKey: undefined,
      dryRun: false,
      pollMs: DEFAULT_POLL_MS,
      minHarvestWei: 0n,
      minAuctionWei: 0n,
      minSizeToFee: 1n,
      minRecoverWei: 0n,
      gasLog: resolveGasLogPath(DEFAULT_GAS_LOG),
    };
  }

  if (positionals.length > 1) {
    throw new ConfigError(`Unexpected arguments: ${positionals.slice(1).join(' ')}`);
  }
  const modeRaw = positionals[0] ?? 'once';
  if (modeRaw !== 'once' && modeRaw !== 'watch') {
    throw new ConfigError(`Unknown command "${modeRaw}". Use once, watch, or --help.`);
  }

  const dryRun = values['dry-run'] === true;
  const rpcUrl = values['rpc-url'] ?? env.NETHER_RPC_URL ?? '';
  const chainRaw = values['chain-id'] ?? env.NETHER_CHAIN_ID ?? '';
  const graveRaw = values.grave ?? env.NETHER_GRAVE ?? '';
  const reaperRaw = values.reaper ?? env.NETHER_REAPER ?? '';
  const keyRaw = values['private-key'] ?? env.NETHER_PRIVATE_KEY;
  const pollRaw = values['poll-ms'] ?? env.NETHER_POLL_MS;
  const minHarvestRaw = values['min-harvest-wei'] ?? env.NETHER_MIN_HARVEST_WEI;
  const minAuctionRaw = values['min-auction-wei'] ?? env.NETHER_MIN_AUCTION_WEI;
  const minSizeRaw = values['min-size-to-fee'] ?? env.NETHER_MIN_SIZE_TO_FEE;
  const minRecoverRaw = values['min-recover-wei'] ?? env.NETHER_MIN_RECOVER_WEI;
  const gasLogRaw = values['gas-log'] ?? env.NETHER_GAS_LOG ?? DEFAULT_GAS_LOG;

  if (!rpcUrl) {
    throw new ConfigError('Missing --rpc-url or NETHER_RPC_URL');
  }
  if (!/^https?:\/\//i.test(rpcUrl)) {
    throw new ConfigError('RPC URL must be HTTP or HTTPS');
  }
  if (!chainRaw) {
    throw new ConfigError('Missing --chain-id or NETHER_CHAIN_ID');
  }
  if (!graveRaw) {
    throw new ConfigError('Missing --grave or NETHER_GRAVE');
  }
  if (!reaperRaw) {
    throw new ConfigError('Missing --reaper or NETHER_REAPER');
  }

  const chainId = parseChainId(chainRaw);
  const grave = parseAddr(graveRaw, 'grave');
  const reaper = parseAddr(reaperRaw, 'reaper');
  const privateKey = parsePrivateKey(keyRaw, dryRun);
  const pollMs = parseUInt(pollRaw, 'poll-ms', DEFAULT_POLL_MS);
  if (pollMs === 0) {
    throw new ConfigError('--poll-ms must be > 0');
  }

  return {
    help: false,
    mode: modeRaw,
    rpcUrl,
    chainId,
    grave,
    reaper,
    privateKey,
    dryRun,
    pollMs,
    minHarvestWei: parseBig(minHarvestRaw, 'min-harvest-wei', 0n),
    minAuctionWei: parseBig(minAuctionRaw, 'min-auction-wei', 0n),
    minSizeToFee: parseBig(minSizeRaw, 'min-size-to-fee', 1n),
    minRecoverWei: parseBig(minRecoverRaw, 'min-recover-wei', 0n),
    gasLog: resolveGasLogPath(gasLogRaw),
  };
}

function parseChainId(raw: string): 8453 | 84532 {
  const key = raw.trim();
  const lower = key.toLowerCase();
  if (key === '8453' || lower === 'base') {
    return BASE_MAINNET;
  }
  if (key === '84532' || lower === 'basesepolia' || lower === 'base-sepolia') {
    return BASE_SEPOLIA;
  }
  throw new ConfigError('Chain id must be 8453 (base) or 84532 (baseSepolia)');
}

function parseAddr(raw: string, label: string): Address {
  try {
    return getAddress(raw);
  } catch {
    throw new ConfigError(`Invalid ${label} address`);
  }
}

function parsePrivateKey(raw: string | undefined, dryRun: boolean): Hex | undefined {
  if (raw === undefined || raw === '') {
    if (dryRun) {
      return undefined;
    }
    throw new ConfigError('Missing --private-key or NETHER_PRIVATE_KEY (not required with --dry-run)');
  }
  const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ConfigError('Invalid private key');
  }
  return hex as Hex;
}

function parseUInt(raw: string | undefined, label: string, fallback: number): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^[0-9]+$/.test(raw)) {
    throw new ConfigError(`Invalid ${label}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) {
    throw new ConfigError(`Invalid ${label}`);
  }
  return n;
}

function parseBig(raw: string | undefined, label: string, fallback: bigint): bigint {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^[0-9]+$/.test(raw)) {
    throw new ConfigError(`Invalid ${label}`);
  }
  return BigInt(raw);
}
