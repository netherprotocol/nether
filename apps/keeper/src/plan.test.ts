import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { zeroAddress, type Address } from 'viem';
import { planTick, shouldFinalize, shouldHarvest, shouldStart, ZERO_FEES, type Policy } from './plan.js';
import { startableEth, type Snapshot } from './snapshot.js';

const REAPER = '0x0000000000000000000000000000000000000002' as Address;
const STRATEGY = '0x0000000000000000000000000000000000000003' as Address;

const policy: Policy = {
  minSizeToFee: 1n,
  minHarvestWei: 0n,
  minAuctionWei: 0n,
};

function snap(over: Partial<Snapshot> = {}): Snapshot {
  const auction = {
    id: 0n,
    ethBudget: 0n,
    ethRemaining: 0n,
    startTime: 0n,
    endTime: 0n,
    active: false,
    ...over.auction,
  };
  const { auction: _ignored, ...rest } = over;
  return {
    chainId: 8453,
    blockNumber: 1n,
    now: 1_000_000n,
    harvestableYield: 0n,
    currentNAV: 10n ** 18n,
    protectedPrincipal: 10n ** 18n,
    activeStrategy: STRATEGY,
    graveReaper: REAPER,
    pendingAdapter: zeroAddress,
    pendingExecuteAfter: 0n,
    availableReaperETH: 0n,
    reaperBalance: 0n,
    operatorBalance: 10n ** 18n,
    harvestViewFailed: false,
    navViewFailed: false,
    ...rest,
    auction,
  };
}

function sends(snapshot: Snapshot, fees = ZERO_FEES, pol = policy) {
  return planTick(snapshot, fees, pol)
    .filter((item) => item.kind !== 'skip')
    .map((item) => item.kind);
}

function skipReason(snapshot: Snapshot, action: 'harvest' | 'start' | 'finalize', fees = ZERO_FEES, pol = policy) {
  const item = planTick(snapshot, fees, pol).find(
    (entry) => entry.kind === 'skip' && entry.action === action,
  );
  return item && item.kind === 'skip' ? item.reason : undefined;
}

describe('planTick', () => {
  it('does not harvest when harvestable is 0', () => {
    assert.deepEqual(sends(snap()), []);
    assert.equal(shouldHarvest(snap()), false);
    assert.equal(skipReason(snap(), 'harvest'), 'no_harvestable_yield');
  });

  it('skips harvest below the fee floor', () => {
    const snapshot = snap({ harvestableYield: 100n, currentNAV: 10n ** 18n + 100n });
    const fees = { harvestFeeWei: 200n, startFeeWei: 0n, finalizeFeeWei: 0n };
    assert.equal(skipReason(snapshot, 'harvest', fees), 'below_fee_floor');
    assert.ok(!sends(snapshot, fees).includes('harvest'));
  });

  it('skips harvest dust versus minHarvestWei', () => {
    const snapshot = snap({ harvestableYield: 50n, currentNAV: 10n ** 18n + 50n });
    const pol: Policy = { ...policy, minHarvestWei: 100n };
    assert.equal(skipReason(snapshot, 'harvest', ZERO_FEES, pol), 'below_fee_floor');
  });

  it('does not finalize or start while an auction is still running', () => {
    const snapshot = snap({
      auction: {
        id: 1n,
        ethBudget: 1n,
        ethRemaining: 1n,
        startTime: 1n,
        endTime: 2_000_000n,
        active: true,
      },
      availableReaperETH: 5n,
      reaperBalance: 6n,
    });
    assert.equal(shouldFinalize(snapshot), false);
    assert.equal(shouldStart(snapshot), false);
    assert.deepEqual(sends(snapshot), []);
    assert.equal(skipReason(snapshot, 'finalize'), 'auction_not_expired');
    assert.equal(skipReason(snapshot, 'start'), 'auction_active');
  });

  it('finalizes only when the auction is expired (start waits)', () => {
    const snapshot = snap({
      now: 2_000_000n,
      auction: {
        id: 1n,
        ethBudget: 8n,
        ethRemaining: 3n,
        startTime: 1n,
        endTime: 2_000_000n,
        active: true,
      },
      availableReaperETH: 0n,
      reaperBalance: 3n,
    });
    assert.deepEqual(sends(snapshot), ['finalize']);
    assert.equal(skipReason(snapshot, 'start'), 'await_finalize');
  });

  it('does not start when inactive and startable is 0', () => {
    const snapshot = snap({ availableReaperETH: 0n, reaperBalance: 0n });
    assert.equal(startableEth(snapshot), 0n);
    assert.equal(skipReason(snapshot, 'start'), 'nothing_startable');
  });

  it('starts when availableReaperETH is 0 but surplus is positive', () => {
    const snapshot = snap({ availableReaperETH: 0n, reaperBalance: 500n });
    assert.equal(startableEth(snapshot), 500n);
    assert.deepEqual(sends(snapshot), ['start']);
  });

  it('skips start below the auction fee floor', () => {
    const snapshot = snap({ availableReaperETH: 10n, reaperBalance: 10n });
    const fees = { harvestFeeWei: 0n, startFeeWei: 50n, finalizeFeeWei: 0n };
    assert.equal(skipReason(snapshot, 'start', fees), 'below_fee_floor');
  });

  it('finalizes with no fee floor even when ethRemaining is 0', () => {
    const snapshot = snap({
      now: 9n,
      auction: {
        id: 2n,
        ethBudget: 1n,
        ethRemaining: 0n,
        startTime: 1n,
        endTime: 8n,
        active: true,
      },
    });
    const fees = { harvestFeeWei: 10n ** 18n, startFeeWei: 10n ** 18n, finalizeFeeWei: 10n ** 18n };
    assert.deepEqual(sends(snapshot, fees), ['finalize']);
  });

  it('does not harvest when currentNAV is below protectedPrincipal', () => {
    const snapshot = snap({
      harvestableYield: 1n,
      currentNAV: 1n,
      protectedPrincipal: 2n,
    });
    assert.equal(shouldHarvest(snapshot), false);
    assert.equal(skipReason(snapshot, 'harvest'), 'nav_below_principal');
  });

  it('still proposes harvest for a lost-race style snapshot', () => {
    const snapshot = snap({ harvestableYield: 1_000n, currentNAV: 10n ** 18n + 1_000n });
    assert.ok(sends(snapshot).includes('harvest'));
  });
});
