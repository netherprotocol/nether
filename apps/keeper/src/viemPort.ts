import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  zeroAddress,
  BaseError,
  ContractFunctionRevertedError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type Log,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { estimateContractL1Fee } from 'viem/op-stack';
import { graveAbi, reaperAbi } from './abi.js';
import { ConfigError, type KeeperConfig } from './config.js';
import {
  ExpectedRevertError,
  isExpectedRevert,
  type CrankAction,
  type CrankCall,
  type FeeEstimate,
  type KeeperPort,
  type SimulateFail,
  type SimulateOk,
  type TxReceiptInfo,
} from './crank.js';
import type { GasDetail } from './gasLog.js';
import type { AuctionView, ImpairedEntry, Snapshot } from './snapshot.js';

export const L1_FEE_PAD_MULTIPLIER = 2n;

type ChainPublicClient = PublicClient<Transport, Chain>;
type ChainWalletClient = WalletClient<Transport, Chain, Account>;

type Clients = {
  publicClient: ChainPublicClient;
  walletClient: ChainWalletClient | undefined;
  account: Account | Address;
  operator: Address | undefined;
  grave: Address;
  reaper: Address;
  chainId: number;
  chain: Chain;
};

export function chainForId(chainId: 8453 | 84532): Chain {
  return chainId === 8453 ? base : baseSepolia;
}

export function createViemPort(config: KeeperConfig): KeeperPort & { publicClient: ChainPublicClient } {
  const chain = chainForId(config.chainId);
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const localAccount = config.privateKey ? privateKeyToAccount(config.privateKey) : undefined;
  const account = localAccount ?? zeroAddress;
  const operator = localAccount?.address;
  const walletClient = localAccount
    ? createWalletClient({ account: localAccount, chain, transport })
    : undefined;
  const ctx: Clients = {
    publicClient,
    walletClient,
    account,
    operator,
    grave: config.grave,
    reaper: config.reaper,
    chainId: config.chainId,
    chain,
  };

  return {
    publicClient,
    readSnapshot: () => readSnapshot(ctx),
    simulate: (call) => simulateAction(ctx, call),
    estimateFee: (call) => estimateActionFee(ctx, call),
    send: (call) => sendAction(ctx, call),
  };
}

export async function assertChainId(client: ChainPublicClient, expected: number): Promise<void> {
  const id = await client.getChainId();
  if (id !== expected) {
    throw new ConfigError(`Chain id ${id} does not match configured ${expected}`);
  }
}

export async function assertReaperMatch(
  client: ChainPublicClient,
  grave: Address,
  expected: Address,
): Promise<void> {
  const onChain = await client.readContract({
    address: grave,
    abi: graveAbi,
    functionName: 'reaper',
  });
  if (onChain !== zeroAddress && onChain.toLowerCase() !== expected.toLowerCase()) {
    throw new ConfigError('Grave.reaper() does not match --reaper');
  }
}

async function readSnapshot(ctx: Clients): Promise<Snapshot> {
  const block = await ctx.publicClient.getBlock({ blockTag: 'latest' });
  const blockNumber = block.number;
  const results = await ctx.publicClient.multicall({
    allowFailure: true,
    blockNumber,
    contracts: [
      { address: ctx.grave, abi: graveAbi, functionName: 'harvestableYield' },
      { address: ctx.grave, abi: graveAbi, functionName: 'currentNAV' },
      { address: ctx.grave, abi: graveAbi, functionName: 'protectedPrincipal' },
      { address: ctx.grave, abi: graveAbi, functionName: 'activeStrategy' },
      { address: ctx.grave, abi: graveAbi, functionName: 'reaper' },
      { address: ctx.grave, abi: graveAbi, functionName: 'pendingStrategy' },
      { address: ctx.reaper, abi: reaperAbi, functionName: 'availableReaperETH' },
      { address: ctx.reaper, abi: reaperAbi, functionName: 'activeAuction' },
      { address: ctx.grave, abi: graveAbi, functionName: 'requiredBacking' },
      { address: ctx.grave, abi: graveAbi, functionName: 'impairedCapital' },
      { address: ctx.grave, abi: graveAbi, functionName: 'impairedAdapterCount' },
      { address: ctx.grave, abi: graveAbi, functionName: 'pendingWithdrawFailures' },
      { address: ctx.grave, abi: graveAbi, functionName: 'lastMigrationFailureTime' },
    ],
  });

  const harvest = results[0];
  const nav = results[1];
  const harvestViewFailed = harvest?.status !== 'success';
  const navViewFailed = nav?.status !== 'success';
  const protectedPrincipal = required<bigint>(results[2], 'protectedPrincipal');
  const impairedCapital = required<bigint>(results[9], 'impairedCapital');
  const requiredBacking =
    results[8]?.status === 'success' ? (results[8].result as bigint) : protectedPrincipal - impairedCapital;
  const impairedCount = required<bigint>(results[10], 'impairedAdapterCount');
  const impairedAdapters = await readImpairedAdapters(ctx, blockNumber, impairedCount);

  const [reaperBalance, operatorBalance] = await Promise.all([
    ctx.publicClient.getBalance({ address: ctx.reaper, blockNumber }),
    ctx.operator
      ? ctx.publicClient.getBalance({ address: ctx.operator, blockNumber })
      : Promise.resolve(0n),
  ]);

  return {
    chainId: ctx.chainId,
    blockNumber,
    now: block.timestamp,
    harvestableYield: harvest?.status === 'success' ? harvest.result : 0n,
    currentNAV: nav?.status === 'success' ? nav.result : 0n,
    protectedPrincipal,
    requiredBacking,
    impairedCapital,
    impairedAdapters,
    pendingWithdrawFailures: required(results[11], 'pendingWithdrawFailures'),
    lastMigrationFailureTime: required(results[12], 'lastMigrationFailureTime'),
    activeStrategy: required(results[3], 'activeStrategy'),
    graveReaper: required(results[4], 'reaper'),
    ...pendingFrom(required(results[5], 'pendingStrategy')),
    availableReaperETH: required(results[6], 'availableReaperETH'),
    auction: auctionFrom(required(results[7], 'activeAuction')),
    reaperBalance,
    operatorBalance,
    harvestViewFailed,
    navViewFailed,
  };
}

async function readImpairedAdapters(
  ctx: Clients,
  blockNumber: bigint,
  count: bigint,
): Promise<ImpairedEntry[]> {
  if (count === 0n) {
    return [];
  }
  const n = Number(count);
  const atResults = await ctx.publicClient.multicall({
    allowFailure: false,
    blockNumber,
    contracts: Array.from({ length: n }, (_, i) => ({
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'impairedAdapterAt' as const,
      args: [BigInt(i)] as const,
    })),
  });
  const adapters = atResults as Address[];
  const owedResults = await ctx.publicClient.multicall({
    allowFailure: false,
    blockNumber,
    contracts: adapters.map((adapter) => ({
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'impairedOwed' as const,
      args: [adapter] as const,
    })),
  });
  return adapters.map((adapter, i) => ({
    adapter,
    owed: owedResults[i] as bigint,
  }));
}

function required<T>(item: { status: string; result?: unknown } | undefined, label: string): T {
  if (!item || item.status !== 'success') {
    throw new Error(`Required view ${label} failed`);
  }
  return item.result as T;
}

function pendingFrom(raw: unknown): { pendingAdapter: Address; pendingExecuteAfter: bigint } {
  if (Array.isArray(raw) && raw.length >= 2) {
    return { pendingAdapter: raw[0] as Address, pendingExecuteAfter: raw[1] as bigint };
  }
  const obj = raw as { adapter: Address; executeAfter: bigint };
  return { pendingAdapter: obj.adapter, pendingExecuteAfter: obj.executeAfter };
}

function auctionFrom(raw: unknown): AuctionView {
  if (Array.isArray(raw)) {
    return {
      id: raw[0] as bigint,
      ethBudget: raw[1] as bigint,
      ethRemaining: raw[2] as bigint,
      startTime: raw[4] as bigint,
      endTime: raw[5] as bigint,
      active: raw[7] as boolean,
    };
  }
  const obj = raw as {
    id: bigint;
    ethBudget: bigint;
    ethRemaining: bigint;
    startTime: bigint;
    endTime: bigint;
    active: boolean;
  };
  return {
    id: obj.id,
    ethBudget: obj.ethBudget,
    ethRemaining: obj.ethRemaining,
    startTime: obj.startTime,
    endTime: obj.endTime,
    active: obj.active,
  };
}

async function simulateAction(ctx: Clients, call: CrankCall): Promise<SimulateOk | SimulateFail> {
  try {
    if (call.action === 'harvest') {
      const { result } = await ctx.publicClient.simulateContract({
        account: ctx.account,
        address: ctx.grave,
        abi: graveAbi,
        functionName: 'harvest',
      });
      return { ok: true, sizeWei: result, detail: { ethHarvested: result.toString() } };
    }
    if (call.action === 'recoverImpaired') {
      const adapter = recoverAdapter(call);
      const { result } = await ctx.publicClient.simulateContract({
        account: ctx.account,
        address: ctx.grave,
        abi: graveAbi,
        functionName: 'recoverImpaired',
        args: [adapter],
      });
      return {
        ok: true,
        sizeWei: result,
        detail: { adapter, ethReceived: result.toString() },
      };
    }
    if (call.action === 'startAuction') {
      const { result } = await ctx.publicClient.simulateContract({
        account: ctx.account,
        address: ctx.reaper,
        abi: reaperAbi,
        functionName: 'startAuction',
      });
      return {
        ok: true,
        sizeWei: 0n,
        detail: { auctionId: result.toString() },
      };
    }
    await ctx.publicClient.simulateContract({
      account: ctx.account,
      address: ctx.reaper,
      abi: reaperAbi,
      functionName: 'finalizeAuction',
    });
    return { ok: true, sizeWei: 0n, detail: {} };
  } catch (err) {
    const errorName = revertErrorName(err) ?? 'Error';
    return {
      ok: false,
      errorName,
      message: err instanceof Error ? err.message : String(err),
      expected: isExpectedRevert(errorName),
    };
  }
}

async function estimateActionFee(ctx: Clients, call: CrankCall): Promise<FeeEstimate> {
  const gasUsed = await estimateGas(ctx, call);
  const feePerGas = await maxFeePerGas(ctx.publicClient);
  const l2Fee = gasUsed * feePerGas;
  let l1Fee = 0n;
  try {
    l1Fee = await estimateL1(ctx, call);
  } catch {
    l1Fee = l2Fee * (L1_FEE_PAD_MULTIPLIER - 1n);
  }
  return {
    feeWei: l2Fee + l1Fee,
    gasUsed,
    effectiveGasPrice: feePerGas,
    l1Fee,
  };
}

async function estimateGas(ctx: Clients, call: CrankCall): Promise<bigint> {
  if (call.action === 'harvest') {
    return ctx.publicClient.estimateContractGas({
      account: ctx.account,
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'harvest',
    });
  }
  if (call.action === 'recoverImpaired') {
    return ctx.publicClient.estimateContractGas({
      account: ctx.account,
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'recoverImpaired',
      args: [recoverAdapter(call)],
    });
  }
  if (call.action === 'startAuction') {
    return ctx.publicClient.estimateContractGas({
      account: ctx.account,
      address: ctx.reaper,
      abi: reaperAbi,
      functionName: 'startAuction',
    });
  }
  return ctx.publicClient.estimateContractGas({
    account: ctx.account,
    address: ctx.reaper,
    abi: reaperAbi,
    functionName: 'finalizeAuction',
  });
}

async function estimateL1(ctx: Clients, call: CrankCall): Promise<bigint> {
  if (call.action === 'harvest') {
    return estimateContractL1Fee(ctx.publicClient, {
      account: ctx.account,
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'harvest',
    });
  }
  if (call.action === 'recoverImpaired') {
    return estimateContractL1Fee(ctx.publicClient, {
      account: ctx.account,
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'recoverImpaired',
      args: [recoverAdapter(call)],
    });
  }
  if (call.action === 'startAuction') {
    return estimateContractL1Fee(ctx.publicClient, {
      account: ctx.account,
      address: ctx.reaper,
      abi: reaperAbi,
      functionName: 'startAuction',
    });
  }
  return estimateContractL1Fee(ctx.publicClient, {
    account: ctx.account,
    address: ctx.reaper,
    abi: reaperAbi,
    functionName: 'finalizeAuction',
  });
}

async function writeAction(ctx: Clients, call: CrankCall): Promise<Hex> {
  const wallet = ctx.walletClient;
  if (!wallet) {
    throw new Error('Cannot send without an operator key');
  }
  const account = ctx.account;
  const chain = ctx.chain;
  if (call.action === 'harvest') {
    return wallet.writeContract({
      account,
      chain,
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'harvest',
    });
  }
  if (call.action === 'recoverImpaired') {
    return wallet.writeContract({
      account,
      chain,
      address: ctx.grave,
      abi: graveAbi,
      functionName: 'recoverImpaired',
      args: [recoverAdapter(call)],
    });
  }
  if (call.action === 'startAuction') {
    return wallet.writeContract({
      account,
      chain,
      address: ctx.reaper,
      abi: reaperAbi,
      functionName: 'startAuction',
    });
  }
  return wallet.writeContract({
    account,
    chain,
    address: ctx.reaper,
    abi: reaperAbi,
    functionName: 'finalizeAuction',
  });
}

async function sendAction(ctx: Clients, call: CrankCall): Promise<TxReceiptInfo> {
  if (!ctx.walletClient) {
    throw new Error('Cannot send without an operator key');
  }
  let hash: Hex;
  try {
    hash = await writeAction(ctx, call);
  } catch (err) {
    const name = revertErrorName(err);
    if (name && isExpectedRevert(name)) {
      throw new ExpectedRevertError(name, err instanceof Error ? err.message : String(err));
    }
    throw err;
  }

  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  const l1Fee = l1FeeFromReceipt(receipt);
  const detail = detailFromLogs(call.action, receipt.logs);
  return {
    tx: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    l1Fee,
    status: receipt.status === 'reverted' ? 'reverted' : 'success',
    detail,
  };
}

function recoverAdapter(call: CrankCall): Address {
  if (!call.adapter) {
    throw new Error('recoverImpaired requires an adapter');
  }
  return call.adapter;
}

function l1FeeFromReceipt(receipt: TransactionReceipt): bigint {
  const extra = receipt as TransactionReceipt & { l1Fee?: bigint | null };
  return extra.l1Fee ?? 0n;
}

function detailFromLogs(action: CrankAction, logs: Log[]): GasDetail {
  if (action === 'harvest') {
    const parsed = parseEventLogs({ abi: graveAbi, logs, eventName: 'YieldHarvested' });
    const log = parsed[0];
    if (!log) {
      return {};
    }
    return { ethHarvested: log.args.ethAmount.toString() };
  }
  if (action === 'recoverImpaired') {
    const parsed = parseEventLogs({ abi: graveAbi, logs, eventName: 'ImpairedRecovered' });
    const log = parsed[0];
    if (!log) {
      return {};
    }
    return {
      adapter: log.args.adapter,
      ethReceived: log.args.received.toString(),
      pay: log.args.pay.toString(),
      impairedCapital: log.args.impairedCapital.toString(),
    };
  }
  if (action === 'startAuction') {
    const parsed = parseEventLogs({ abi: reaperAbi, logs, eventName: 'ReapingStarted' });
    const log = parsed[0];
    if (!log) {
      return {};
    }
    return {
      auctionId: log.args.auctionId.toString(),
      ethBudget: log.args.ethBudget.toString(),
    };
  }
  const parsed = parseEventLogs({ abi: reaperAbi, logs, eventName: 'ReapingFinalized' });
  const log = parsed[0];
  if (!log) {
    return {};
  }
  return {
    auctionId: log.args.auctionId.toString(),
    ethSpent: log.args.ethSpent.toString(),
    nethBurned: log.args.nethBurned.toString(),
    ethRolledOver: log.args.ethRolledOver.toString(),
  };
}

async function maxFeePerGas(client: ChainPublicClient): Promise<bigint> {
  const fees = await client.estimateFeesPerGas();
  if (fees.maxFeePerGas && fees.maxFeePerGas > 0n) {
    return fees.maxFeePerGas;
  }
  if (fees.gasPrice && fees.gasPrice > 0n) {
    return fees.gasPrice;
  }
  return client.getGasPrice();
}

export function revertErrorName(err: unknown): string | undefined {
  if (err instanceof ExpectedRevertError) {
    return err.errorName;
  }
  if (err instanceof ContractFunctionRevertedError) {
    return err.data?.errorName;
  }
  if (err instanceof BaseError) {
    const walked = err.walk((candidate) => candidate instanceof ContractFunctionRevertedError);
    if (walked instanceof ContractFunctionRevertedError) {
      return walked.data?.errorName;
    }
  }
  return undefined;
}
