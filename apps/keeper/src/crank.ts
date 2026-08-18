import type { Address } from 'viem';
import { alertsFor, emitAlerts } from './alerts.js';
import { appendGasRecord, type CrankAction, type GasDetail, type GasStore } from './gasLog.js';
import {
  belowSizeFloor,
  planTick,
  ZERO_FEES,
  type PlannedAction,
  type Policy,
} from './plan.js';
import { startableEth, type Snapshot } from './snapshot.js';

export type { CrankAction };

export const EXPECTED_REVERTS = new Set([
  'NoHarvestableYield',
  'ZeroHarvest',
  'AuctionActive',
  'ZeroValue',
  'NoActiveAuction',
  'AuctionNotExpired',
  'ReaperNotSet',
  'HarvestBreachesPrincipal',
  'ZeroRewardRate',
  'AdapterNotImpaired',
  'ZeroRecover',
]);

export const OPERATOR_BALANCE_PAD_WEI = 10_000n;

export class ExpectedRevertError extends Error {
  readonly errorName: string;
  constructor(errorName: string, message?: string) {
    super(message ?? errorName);
    this.name = 'ExpectedRevertError';
    this.errorName = errorName;
  }
}

export type SimulateOk = {
  ok: true;
  sizeWei: bigint;
  detail: GasDetail;
};

export type SimulateFail = {
  ok: false;
  errorName: string;
  message: string;
  expected: boolean;
};

export type FeeEstimate = {
  feeWei: bigint;
  gasUsed: bigint | null;
  effectiveGasPrice: bigint | null;
  l1Fee: bigint;
};

export type TxReceiptInfo = {
  tx: `0x${string}`;
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  l1Fee: bigint;
  status: 'success' | 'reverted';
  detail: GasDetail;
};

export type CrankCall = {
  action: CrankAction;
  adapter?: Address;
};

export type KeeperPort = {
  readSnapshot(): Promise<Snapshot>;
  simulate(call: CrankCall): Promise<SimulateOk | SimulateFail>;
  estimateFee(call: CrankCall): Promise<FeeEstimate>;
  send(call: CrankCall): Promise<TxReceiptInfo>;
};

export type Logger = {
  info(line: string): void;
  warn(line: string): void;
  error(line: string): void;
};

export type CrankState = {
  previous?: Snapshot;
  lastFeeWei: bigint;
};

export type TickAttempt = {
  action: CrankAction;
  outcome: 'sent' | 'would_send' | 'skip';
  skipReason?: string;
  feeWei?: bigint;
  adapter?: Address;
};

export type TickOptions = {
  port: KeeperPort;
  policy: Policy;
  store: GasStore;
  log: Logger;
  dryRun: boolean;
  chainId: number;
  hasOperator: boolean;
  state: CrankState;
};

export function isExpectedRevert(name: string | undefined): boolean {
  return name !== undefined && EXPECTED_REVERTS.has(name);
}

export async function runTick(opts: TickOptions): Promise<{ snapshot: Snapshot; attempts: TickAttempt[] }> {
  const attempts: TickAttempt[] = [];
  let snapshot = await opts.port.readSnapshot();
  emitAlerts(alertsFor(snapshot, opts.state.previous, opts.state.lastFeeWei), (line) =>
    opts.log.error(line),
  );

  const kinds: Array<'finalize' | 'recoverImpaired' | 'harvest' | 'start'> = [
    'finalize',
    'recoverImpaired',
    'harvest',
    'start',
  ];
  for (const kind of kinds) {
    const plannedList = planTick(snapshot, ZERO_FEES, opts.policy).filter(
      (item) => item.kind === kind || (item.kind === 'skip' && item.action === kind),
    );
    for (const planned of plannedList) {
      if (planned.kind === 'skip') {
        if (planned.reason !== 'below_fee_floor') {
          continue;
        }
        const skip = skipAttempt(opts, callFor(planned), 'below_fee_floor', 0n, planned.sizeWei);
        attempts.push(skip);
        continue;
      }

      const result = await trySend(opts, snapshot, callFor(planned), planned);
      attempts.push(result.attempt);
      if (result.refresh) {
        snapshot = await opts.port.readSnapshot();
      }
    }
  }

  opts.state.previous = snapshot;
  return { snapshot, attempts };
}

function callFor(planned: PlannedAction): CrankCall {
  if (planned.kind === 'recoverImpaired') {
    return { action: 'recoverImpaired', adapter: planned.adapter };
  }
  if (planned.kind === 'harvest' || (planned.kind === 'skip' && planned.action === 'harvest')) {
    return { action: 'harvest' };
  }
  if (planned.kind === 'start' || (planned.kind === 'skip' && planned.action === 'start')) {
    return { action: 'startAuction' };
  }
  if (planned.kind === 'skip' && planned.action === 'recoverImpaired') {
    return { action: 'recoverImpaired', adapter: planned.adapter };
  }
  return { action: 'finalizeAuction' };
}

async function trySend(
  opts: TickOptions,
  snapshot: Snapshot,
  call: CrankCall,
  planned: PlannedAction,
): Promise<{ attempt: TickAttempt; refresh: boolean }> {
  const simulated = await opts.port.simulate(call);
  if (!simulated.ok) {
    const reason = simulated.expected ? `revert:${simulated.errorName}` : `unexpected_revert:${simulated.errorName}`;
    if (!simulated.expected) {
      opts.log.error(`alert ${call.action} simulation reverted: ${simulated.message}`);
    }
    return { attempt: skipAttempt(opts, call, reason, 0n), refresh: false };
  }

  if (call.action === 'recoverImpaired' && simulated.sizeWei === 0n) {
    return { attempt: skipAttempt(opts, call, 'no_eth_increase', 0n, 0n), refresh: false };
  }

  const sizeWei =
    call.action === 'harvest' || call.action === 'recoverImpaired'
      ? simulated.sizeWei
      : call.action === 'startAuction'
        ? startableEth(snapshot)
        : 0n;

  const estimate = await opts.port.estimateFee(call);

  if (call.action === 'recoverImpaired') {
    if (sizeWei < opts.policy.minRecoverWei) {
      return {
        attempt: skipAttempt(opts, call, 'below_min_recover', estimate.feeWei, sizeWei, estimate),
        refresh: false,
      };
    }
  } else if (call.action !== 'finalizeAuction' && planned.kind !== 'finalize') {
    const minSizeWei = call.action === 'harvest' ? opts.policy.minHarvestWei : opts.policy.minAuctionWei;
    if (belowSizeFloor(sizeWei, estimate.feeWei, minSizeWei, opts.policy.minSizeToFee)) {
      return {
        attempt: skipAttempt(opts, call, 'below_fee_floor', estimate.feeWei, sizeWei, estimate),
        refresh: false,
      };
    }
  }

  if (!opts.dryRun && opts.hasOperator) {
    if (snapshot.operatorBalance < estimate.feeWei + OPERATOR_BALANCE_PAD_WEI) {
      opts.log.warn(
        `warn ${call.action} insufficient operator ETH (balance=${snapshot.operatorBalance} feeWei=${estimate.feeWei})`,
      );
      return {
        attempt: skipAttempt(opts, call, 'insufficient_balance', estimate.feeWei, sizeWei, estimate),
        refresh: false,
      };
    }
  }

  const detail = {
    ...simulated.detail,
    ...(call.action === 'startAuction' ? { ethBudget: sizeWei.toString() } : {}),
    ...(call.adapter ? { adapter: call.adapter } : {}),
  };

  if (opts.dryRun) {
    appendGasRecord(opts.store, {
      chainId: opts.chainId,
      action: call.action,
      sent: false,
      feeWei: estimate.feeWei,
      gasUsed: estimate.gasUsed,
      effectiveGasPrice: estimate.effectiveGasPrice,
      l1Fee: estimate.l1Fee,
      detail,
    });
    opts.log.info(humanLine(call.action, 'would_send', estimate.feeWei, opts.store.sessionFeeWei, detail));
    return {
      attempt: { action: call.action, outcome: 'would_send', feeWei: estimate.feeWei, adapter: call.adapter },
      refresh: false,
    };
  }

  let receipt: TxReceiptInfo;
  try {
    receipt = await opts.port.send(call);
  } catch (err) {
    if (err instanceof ExpectedRevertError && isExpectedRevert(err.errorName)) {
      return { attempt: skipAttempt(opts, call, `revert:${err.errorName}`, 0n, sizeWei), refresh: false };
    }
    throw err;
  }

  const feeWei = receipt.gasUsed * receipt.effectiveGasPrice + receipt.l1Fee;
  const mergedDetail = { ...detail, ...receipt.detail };
  appendGasRecord(opts.store, {
    chainId: opts.chainId,
    action: call.action,
    sent: true,
    tx: receipt.tx,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    l1Fee: receipt.l1Fee,
    feeWei,
    detail: mergedDetail,
    skipReason: receipt.status === 'reverted' ? 'onchain_revert' : undefined,
  });
  opts.state.lastFeeWei = feeWei;

  if (receipt.status === 'reverted') {
    opts.log.error(`alert ${call.action} on-chain revert tx=${receipt.tx} feeWei=${feeWei}`);
    return {
      attempt: { action: call.action, outcome: 'skip', skipReason: 'onchain_revert', feeWei, adapter: call.adapter },
      refresh: true,
    };
  }

  opts.log.info(humanLine(call.action, 'sent', feeWei, opts.store.sessionFeeWei, mergedDetail, receipt.tx));
  return { attempt: { action: call.action, outcome: 'sent', feeWei, adapter: call.adapter }, refresh: true };
}

function skipAttempt(
  opts: TickOptions,
  call: CrankCall,
  reason: string,
  feeWei: bigint,
  sizeWei?: bigint,
  estimate?: FeeEstimate,
): TickAttempt {
  const detail: GasDetail | null =
    sizeWei === undefined && !call.adapter
      ? null
      : {
          ...(sizeWei === undefined ? {} : { sizeWei: sizeWei.toString() }),
          ...(call.adapter ? { adapter: call.adapter } : {}),
        };
  appendGasRecord(opts.store, {
    chainId: opts.chainId,
    action: call.action,
    sent: false,
    feeWei,
    gasUsed: estimate?.gasUsed ?? null,
    effectiveGasPrice: estimate?.effectiveGasPrice ?? null,
    l1Fee: estimate?.l1Fee ?? 0n,
    detail,
    skipReason: reason,
  });
  opts.log.warn(
    `${call.action} skip ${reason}${call.adapter ? ` adapter=${call.adapter}` : ''}${sizeWei !== undefined ? ` sizeWei=${sizeWei}` : ''}${feeWei > 0n ? ` feeWei=${feeWei}` : ''}`,
  );
  return { action: call.action, outcome: 'skip', skipReason: reason, feeWei, adapter: call.adapter };
}

function humanLine(
  action: CrankAction,
  outcome: 'sent' | 'would_send',
  feeWei: bigint,
  sessionFeeWei: bigint,
  detail: GasDetail,
  tx?: string,
): string {
  const parts = [`${action} ${outcome}`, `feeWei=${feeWei}`, `sessionFeeWei=${sessionFeeWei}`];
  if (tx) {
    parts.splice(1, 0, `tx=${tx}`);
  }
  for (const [key, value] of Object.entries(detail)) {
    parts.push(`${key}=${value}`);
  }
  return parts.join(' ');
}
