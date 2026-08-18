import { zeroAddress, type Address } from 'viem';
import { startableEth, type Snapshot } from './snapshot.js';

export type Policy = {
  minSizeToFee: bigint;
  minHarvestWei: bigint;
  minAuctionWei: bigint;
  minRecoverWei: bigint;
};

export type FeeEstimates = {
  harvestFeeWei: bigint;
  startFeeWei: bigint;
  finalizeFeeWei: bigint;
};

export const ZERO_FEES: FeeEstimates = {
  harvestFeeWei: 0n,
  startFeeWei: 0n,
  finalizeFeeWei: 0n,
};

export type SkipReason =
  | 'no_harvestable_yield'
  | 'below_fee_floor'
  | 'nav_below_principal'
  | 'harvest_view_failed'
  | 'reaper_not_set'
  | 'auction_active'
  | 'auction_not_expired'
  | 'await_finalize'
  | 'nothing_startable';

export type PlannedAction =
  | { kind: 'finalize'; reason: 'auction_expired' }
  | { kind: 'recoverImpaired'; reason: 'impaired_owed'; adapter: Address; sizeWei: bigint }
  | { kind: 'harvest'; reason: 'harvestable_yield'; sizeWei: bigint }
  | { kind: 'start'; reason: 'startable_eth'; sizeWei: bigint }
  | {
      kind: 'skip';
      action: 'finalize' | 'harvest' | 'start' | 'recoverImpaired';
      reason: SkipReason;
      sizeWei?: bigint;
      adapter?: Address;
    };

export function belowSizeFloor(
  sizeWei: bigint,
  feeWei: bigint,
  minSizeWei: bigint,
  minSizeToFee: bigint,
): boolean {
  const feeFloor = feeWei * minSizeToFee;
  const need = minSizeWei > feeFloor ? minSizeWei : feeFloor;
  return sizeWei < need;
}

export function shouldFinalize(snapshot: Snapshot): boolean {
  return snapshot.auction.active && snapshot.now >= snapshot.auction.endTime;
}

export function shouldHarvest(snapshot: Snapshot): boolean {
  if (snapshot.harvestViewFailed || snapshot.navViewFailed) {
    return false;
  }
  if (snapshot.graveReaper === zeroAddress) {
    return false;
  }
  if (snapshot.currentNAV < snapshot.requiredBacking) {
    return false;
  }
  return snapshot.harvestableYield > 0n;
}

export function shouldStart(snapshot: Snapshot): boolean {
  return !snapshot.auction.active && startableEth(snapshot) > 0n;
}

export function planTick(snapshot: Snapshot, fees: FeeEstimates, policy: Policy): PlannedAction[] {
  const actions: PlannedAction[] = [];

  if (shouldFinalize(snapshot)) {
    actions.push({ kind: 'finalize', reason: 'auction_expired' });
  } else if (snapshot.auction.active) {
    actions.push({ kind: 'skip', action: 'finalize', reason: 'auction_not_expired' });
  }

  for (const entry of snapshot.impairedAdapters) {
    if (entry.owed > 0n) {
      actions.push({
        kind: 'recoverImpaired',
        reason: 'impaired_owed',
        adapter: entry.adapter,
        sizeWei: entry.owed,
      });
    }
  }

  if (snapshot.harvestViewFailed || snapshot.navViewFailed) {
    actions.push({ kind: 'skip', action: 'harvest', reason: 'harvest_view_failed' });
  } else if (snapshot.currentNAV < snapshot.requiredBacking) {
    actions.push({ kind: 'skip', action: 'harvest', reason: 'nav_below_principal' });
  } else if (snapshot.graveReaper === zeroAddress) {
    actions.push({ kind: 'skip', action: 'harvest', reason: 'reaper_not_set' });
  } else if (snapshot.harvestableYield === 0n) {
    actions.push({ kind: 'skip', action: 'harvest', reason: 'no_harvestable_yield' });
  } else if (
    belowSizeFloor(snapshot.harvestableYield, fees.harvestFeeWei, policy.minHarvestWei, policy.minSizeToFee)
  ) {
    actions.push({
      kind: 'skip',
      action: 'harvest',
      reason: 'below_fee_floor',
      sizeWei: snapshot.harvestableYield,
    });
  } else {
    actions.push({ kind: 'harvest', reason: 'harvestable_yield', sizeWei: snapshot.harvestableYield });
  }

  if (snapshot.auction.active) {
    actions.push({
      kind: 'skip',
      action: 'start',
      reason: shouldFinalize(snapshot) ? 'await_finalize' : 'auction_active',
    });
  } else {
    const startable = startableEth(snapshot);
    if (startable === 0n) {
      actions.push({ kind: 'skip', action: 'start', reason: 'nothing_startable' });
    } else if (belowSizeFloor(startable, fees.startFeeWei, policy.minAuctionWei, policy.minSizeToFee)) {
      actions.push({ kind: 'skip', action: 'start', reason: 'below_fee_floor', sizeWei: startable });
    } else {
      actions.push({ kind: 'start', reason: 'startable_eth', sizeWei: startable });
    }
  }

  return actions;
}

export function nextPollDelayMs(snapshot: Snapshot, pollMs: number, slackSeconds = 2n): number {
  const waitingToFinalize =
    snapshot.auction.active && snapshot.now < snapshot.auction.endTime && !shouldHarvest(snapshot);
  if (!waitingToFinalize) {
    return pollMs;
  }
  const deltaSec = snapshot.auction.endTime - snapshot.now + slackSeconds;
  if (deltaSec <= 0n) {
    return pollMs;
  }
  const untilMs = Number(deltaSec) * 1000;
  if (!Number.isFinite(untilMs) || untilMs <= 0) {
    return pollMs;
  }
  return Math.min(pollMs, untilMs);
}
