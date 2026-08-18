import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { zeroAddress, type Address } from 'viem';
import { alertsFor } from './alerts.js';
import type { Snapshot } from './snapshot.js';

const REAPER = '0x0000000000000000000000000000000000000002' as Address;
const STRATEGY = '0x0000000000000000000000000000000000000003' as Address;
const OLD = '0x00000000000000000000000000000000000000aa' as Address;

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
  const protectedPrincipal = rest.protectedPrincipal ?? 10n ** 18n;
  const impairedCapital = rest.impairedCapital ?? 0n;
  return {
    chainId: 8453,
    blockNumber: 1n,
    now: 1_000_000n,
    harvestableYield: 0n,
    currentNAV: 10n ** 18n,
    protectedPrincipal,
    requiredBacking: rest.requiredBacking ?? protectedPrincipal - impairedCapital,
    impairedCapital,
    impairedAdapters: [],
    pendingWithdrawFailures: 0n,
    lastMigrationFailureTime: 0n,
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

describe('alertsFor', () => {
  it('alerts live loss only when NAV is below principal and nothing is impaired', () => {
    const alerts = alertsFor(
      snap({ currentNAV: 1n, protectedPrincipal: 2n, requiredBacking: 2n, impairedCapital: 0n }),
      undefined,
      0n,
    );
    assert.equal(
      alerts.some((item) => item.message.includes('currentNAV') && item.message.includes('protectedPrincipal')),
      true,
    );
  });

  it('alerts residual claim when impairedCapital is set and does not treat that as live loss', () => {
    const alerts = alertsFor(
      snap({
        currentNAV: 6n * 10n ** 17n,
        protectedPrincipal: 10n ** 18n,
        requiredBacking: 6n * 10n ** 17n,
        impairedCapital: 4n * 10n ** 17n,
        impairedAdapters: [{ adapter: OLD, owed: 4n * 10n ** 17n }],
      }),
      undefined,
      0n,
    );
    assert.equal(alerts.some((item) => item.message.includes('currentNAV')), false);
    assert.equal(alerts.some((item) => item.message.includes('impaired residual claim')), true);
  });
});
