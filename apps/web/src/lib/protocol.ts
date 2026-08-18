import { createPublicClient, custom, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { graveAbi, nethAbi, reaperAbi } from './abi.ts';
import type { DeploymentContracts } from './deployments.ts';
import { ONE_ETH } from './format.ts';
import type { NetworkConfig } from './networks.ts';
import { ExecutionRevertedError, type StickyRpcPool } from './rpcPool.ts';

export class ContractReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractReadError';
  }
}

export type AuctionSnapshot = {
  id: bigint;
  ethBudget: bigint;
  ethRemaining: bigint;
  snapshottedRewardRate: bigint;
  startTime: bigint;
  endTime: bigint;
  nethBurned: bigint;
  active: boolean;
};

export type ImpairedAdapter = {
  adapter: Address;
  owed: bigint;
};

export type ProtocolSnapshot = {
  now: bigint;
  protectedPrincipal: bigint;
  requiredBacking: bigint;
  impairedCapital: bigint;
  impairedAdapters: ImpairedAdapter[];
  pendingWithdrawFailures: bigint;
  lastMigrationFailureTime: bigint;
  nethSupply: bigint;
  currentEra: bigint;
  currentEraBuried: bigint;
  currentEraCapacity: bigint;
  currentRewardRate: bigint;
  quoteBuryOneEth: bigint;
  harvestableYield: bigint;
  currentNAV: bigint;
  activeStrategy: Address;
  pendingAdapter: Address;
  pendingExecuteAfter: bigint;
  availableReaperETH: bigint;
  auction: AuctionSnapshot;
  currentReaperRate: bigint;
  totalNethReaped: bigint;
  totalHarvestedETH: bigint;
};

const ZERO: Address = '0x0000000000000000000000000000000000000000';

export function createPoolClient(network: NetworkConfig, pool: StickyRpcPool) {
  const chain = network.chainId === 8453 ? base : baseSepolia;
  const provider = {
    request: ({ method, params }: { method: string; params?: readonly unknown[] }) => {
      const args = Array.isArray(params) ? [...params] : [];
      return pool.request(method, args);
    },
  };
  return createPublicClient({
    chain,
    transport: custom(provider, { retryCount: 0 }),
  });
}

export type PoolClient = ReturnType<typeof createPoolClient>;

export async function readSnapshot(
  client: PoolClient,
  contracts: DeploymentContracts,
): Promise<ProtocolSnapshot> {
  const [block, results] = await Promise.all([
    client.getBlock({ blockTag: 'latest' }),
    client.multicall({
      allowFailure: true,
      contracts: [
        { address: contracts.grave, abi: graveAbi, functionName: 'currentEra' },
        { address: contracts.grave, abi: graveAbi, functionName: 'currentEraBuried' },
        { address: contracts.grave, abi: graveAbi, functionName: 'currentEraCapacity' },
        { address: contracts.grave, abi: graveAbi, functionName: 'currentRewardRate' },
        { address: contracts.grave, abi: graveAbi, functionName: 'quoteBury', args: [ONE_ETH] },
        { address: contracts.grave, abi: graveAbi, functionName: 'protectedPrincipal' },
        { address: contracts.grave, abi: graveAbi, functionName: 'currentNAV' },
        { address: contracts.grave, abi: graveAbi, functionName: 'harvestableYield' },
        { address: contracts.grave, abi: graveAbi, functionName: 'activeStrategy' },
        { address: contracts.grave, abi: graveAbi, functionName: 'pendingStrategy' },
        { address: contracts.neth, abi: nethAbi, functionName: 'totalSupply' },
        { address: contracts.reaper, abi: reaperAbi, functionName: 'availableReaperETH' },
        { address: contracts.reaper, abi: reaperAbi, functionName: 'activeAuction' },
        { address: contracts.reaper, abi: reaperAbi, functionName: 'currentReaperRate' },
        { address: contracts.reaper, abi: reaperAbi, functionName: 'totalNethReaped' },
        { address: contracts.reaper, abi: reaperAbi, functionName: 'totalHarvestedETH' },
        { address: contracts.grave, abi: graveAbi, functionName: 'requiredBacking' },
        { address: contracts.grave, abi: graveAbi, functionName: 'impairedCapital' },
        { address: contracts.grave, abi: graveAbi, functionName: 'impairedAdapterCount' },
        { address: contracts.grave, abi: graveAbi, functionName: 'pendingWithdrawFailures' },
        { address: contracts.grave, abi: graveAbi, functionName: 'lastMigrationFailureTime' },
      ],
    }),
  ]);

  const pending = required(results[9], 'pendingStrategy');
  const { adapter, executeAfter } = pendingFrom(pending);
  const protectedPrincipal = required<bigint>(results[5], 'protectedPrincipal');
  const impairedCapital = optionalBig(results[17], 0n);
  const requiredBacking =
    results[16]?.status === 'success' ? (results[16].result as bigint) : protectedPrincipal - impairedCapital;
  const impairedCount = optionalBig(results[18], 0n);
  const impairedAdapters = await readImpairedAdapters(client, contracts.grave, impairedCount);

  return {
    now: block.timestamp,
    currentEra: required(results[0], 'currentEra'),
    currentEraBuried: required(results[1], 'currentEraBuried'),
    currentEraCapacity: required(results[2], 'currentEraCapacity'),
    currentRewardRate: required(results[3], 'currentRewardRate'),
    quoteBuryOneEth: required(results[4], 'quoteBury'),
    protectedPrincipal,
    requiredBacking,
    impairedCapital,
    impairedAdapters,
    pendingWithdrawFailures: optionalBig(results[19], 0n),
    lastMigrationFailureTime: optionalBig(results[20], 0n),
    currentNAV: required(results[6], 'currentNAV'),
    harvestableYield: required(results[7], 'harvestableYield'),
    activeStrategy: required(results[8], 'activeStrategy'),
    pendingAdapter: adapter,
    pendingExecuteAfter: executeAfter,
    nethSupply: required(results[10], 'totalSupply'),
    availableReaperETH: required(results[11], 'availableReaperETH'),
    auction: auctionFrom(required(results[12], 'activeAuction')),
    currentReaperRate: required(results[13], 'currentReaperRate'),
    totalNethReaped: required(results[14], 'totalNethReaped'),
    totalHarvestedETH: required(results[15], 'totalHarvestedETH'),
  };
}

export async function quoteBuryAmount(
  client: PoolClient,
  grave: Address,
  amount: bigint,
): Promise<bigint | null> {
  if (amount === 0n) {
    return 0n;
  }
  try {
    return await client.readContract({
      address: grave,
      abi: graveAbi,
      functionName: 'quoteBury',
      args: [amount],
    });
  } catch (error) {
    if (error instanceof ExecutionRevertedError || isRevertLike(error)) {
      return null;
    }
    throw error;
  }
}

export async function quoteReaperAmount(
  client: PoolClient,
  reaper: Address,
  amount: bigint,
): Promise<bigint | null> {
  if (amount === 0n) {
    return 0n;
  }
  try {
    return await client.readContract({
      address: reaper,
      abi: reaperAbi,
      functionName: 'quoteReaperSale',
      args: [amount],
    });
  } catch (error) {
    if (error instanceof ExecutionRevertedError || isRevertLike(error)) {
      return null;
    }
    throw error;
  }
}

function optionalBig(item: { status: string; result?: unknown } | undefined, fallback: bigint): bigint {
  if (!item || item.status !== 'success') {
    return fallback;
  }
  return item.result as bigint;
}

async function readImpairedAdapters(
  client: PoolClient,
  grave: Address,
  count: bigint,
): Promise<ImpairedAdapter[]> {
  if (count === 0n) {
    return [];
  }
  const n = Number(count);
  const atResults = await client.multicall({
    allowFailure: true,
    contracts: Array.from({ length: n }, (_, i) => ({
      address: grave,
      abi: graveAbi,
      functionName: 'impairedAdapterAt' as const,
      args: [BigInt(i)] as const,
    })),
  });
  const adapters: Address[] = [];
  for (const item of atResults) {
    if (item.status === 'success') {
      adapters.push(item.result as Address);
    }
  }
  if (adapters.length === 0) {
    return [];
  }
  const owedResults = await client.multicall({
    allowFailure: true,
    contracts: adapters.map((adapter) => ({
      address: grave,
      abi: graveAbi,
      functionName: 'impairedOwed' as const,
      args: [adapter] as const,
    })),
  });
  return adapters.map((adapter, i) => ({
    adapter,
    owed: owedResults[i]?.status === 'success' ? (owedResults[i].result as bigint) : 0n,
  }));
}

function required<T>(item: { status: string; result?: unknown } | undefined, label: string): T {
  if (!item || item.status !== 'success') {
    throw new ContractReadError(`Required view ${label} failed`);
  }
  return item.result as T;
}

function pendingFrom(raw: unknown): { adapter: Address; executeAfter: bigint } {
  if (Array.isArray(raw) && raw.length >= 2) {
    return { adapter: raw[0] as Address, executeAfter: raw[1] as bigint };
  }
  const obj = raw as { adapter: Address; executeAfter: bigint };
  return { adapter: obj.adapter ?? ZERO, executeAfter: obj.executeAfter ?? 0n };
}

function auctionFrom(raw: unknown): AuctionSnapshot {
  if (Array.isArray(raw)) {
    return {
      id: raw[0] as bigint,
      ethBudget: raw[1] as bigint,
      ethRemaining: raw[2] as bigint,
      snapshottedRewardRate: raw[3] as bigint,
      startTime: raw[4] as bigint,
      endTime: raw[5] as bigint,
      nethBurned: raw[6] as bigint,
      active: raw[7] as boolean,
    };
  }
  const obj = raw as AuctionSnapshot;
  return {
    id: obj.id,
    ethBudget: obj.ethBudget,
    ethRemaining: obj.ethRemaining,
    snapshottedRewardRate: obj.snapshottedRewardRate,
    startTime: obj.startTime,
    endTime: obj.endTime,
    nethBurned: obj.nethBurned,
    active: obj.active,
  };
}

function isRevertLike(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes('execution reverted') || message.includes('reverted');
}
