import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { zeroAddress, type Address } from 'viem';
import {
  ExpectedRevertError,
  runTick,
  type CrankCall,
  type CrankState,
  type FeeEstimate,
  type KeeperPort,
  type Logger,
  type SimulateFail,
  type SimulateOk,
  type TxReceiptInfo,
} from './crank.js';
import { openGasLog, type CrankAction, type GasRecord } from './gasLog.js';
import type { Policy } from './plan.js';
import type { Snapshot } from './snapshot.js';

const REAPER = '0x0000000000000000000000000000000000000002' as Address;
const STRATEGY = '0x0000000000000000000000000000000000000003' as Address;

const policy: Policy = {
  minSizeToFee: 1n,
  minHarvestWei: 0n,
  minAuctionWei: 0n,
  minRecoverWei: 0n,
};

const defaultFee: FeeEstimate = {
  feeWei: 150n,
  gasUsed: 10n,
  effectiveGasPrice: 10n,
  l1Fee: 50n,
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

class StubPort implements KeeperPort {
  snapshot: Snapshot;
  sent: CrankAction[] = [];
  simulateMap: Partial<Record<CrankAction, SimulateOk | SimulateFail>> = {};
  recoverSimulates: Record<string, SimulateOk | SimulateFail> = {};
  fees: Partial<Record<CrankAction, FeeEstimate>> = {};
  sendErrors: Partial<Record<CrankAction, string>> = {};
  recoverSendErrors: Record<string, string> = {};
  receipts: Partial<Record<CrankAction, TxReceiptInfo>> = {};

  constructor(snapshot: Snapshot) {
    this.snapshot = snapshot;
  }

  async readSnapshot(): Promise<Snapshot> {
    return this.snapshot;
  }

  async simulate(call: CrankCall): Promise<SimulateOk | SimulateFail> {
    if (call.action === 'recoverImpaired' && call.adapter) {
      const mapped = this.recoverSimulates[call.adapter.toLowerCase()];
      if (mapped) {
        return mapped;
      }
    }
    const mapped = this.simulateMap[call.action];
    if (mapped) {
      return mapped;
    }
    if (call.action === 'harvest') {
      const sizeWei = this.snapshot.harvestableYield;
      return { ok: true, sizeWei, detail: { ethHarvested: sizeWei.toString() } };
    }
    if (call.action === 'recoverImpaired') {
      const adapter = call.adapter;
      const entry = this.snapshot.impairedAdapters.find(
        (item) => item.adapter.toLowerCase() === adapter?.toLowerCase(),
      );
      const sizeWei = entry?.owed ?? 0n;
      if (sizeWei === 0n) {
        return { ok: false, errorName: 'AdapterNotImpaired', message: 'AdapterNotImpaired', expected: true };
      }
      return { ok: true, sizeWei, detail: { adapter: adapter ?? '', ethReceived: sizeWei.toString() } };
    }
    if (call.action === 'startAuction') {
      return { ok: true, sizeWei: 1_000n, detail: { auctionId: '1' } };
    }
    return {
      ok: true,
      sizeWei: 0n,
      detail: {
        auctionId: this.snapshot.auction.id.toString(),
        ethRolledOver: '0',
        ethSpent: '0',
        nethBurned: '0',
      },
    };
  }

  async estimateFee(call: CrankCall): Promise<FeeEstimate> {
    return this.fees[call.action] ?? defaultFee;
  }

  async send(call: CrankCall): Promise<TxReceiptInfo> {
    this.sent.push(call.action);
    const recoverErr = call.adapter ? this.recoverSendErrors[call.adapter.toLowerCase()] : undefined;
    const err = recoverErr ?? this.sendErrors[call.action];
    if (err) {
      throw new ExpectedRevertError(err);
    }
    if (call.action === 'finalizeAuction') {
      const rolled = this.snapshot.auction.ethRemaining;
      this.snapshot = {
        ...this.snapshot,
        availableReaperETH: this.snapshot.availableReaperETH + rolled,
        reaperBalance: this.snapshot.reaperBalance,
        auction: { ...this.snapshot.auction, active: false, ethRemaining: 0n },
      };
    }
    if (call.action === 'harvest') {
      const harvested = this.snapshot.harvestableYield;
      this.snapshot = {
        ...this.snapshot,
        harvestableYield: 0n,
        currentNAV: this.snapshot.currentNAV - harvested,
        availableReaperETH: this.snapshot.availableReaperETH + harvested,
        reaperBalance: this.snapshot.reaperBalance + harvested,
      };
    }
    if (call.action === 'recoverImpaired' && call.adapter) {
      const adapter = call.adapter;
      const entry = this.snapshot.impairedAdapters.find(
        (item) => item.adapter.toLowerCase() === adapter.toLowerCase(),
      );
      const pay = entry?.owed ?? 0n;
      this.snapshot = {
        ...this.snapshot,
        impairedCapital: this.snapshot.impairedCapital - pay,
        requiredBacking: this.snapshot.requiredBacking + pay,
        currentNAV: this.snapshot.currentNAV + pay,
        impairedAdapters: this.snapshot.impairedAdapters.filter(
          (item) => item.adapter.toLowerCase() !== adapter.toLowerCase(),
        ),
      };
    }
    if (call.action === 'startAuction') {
      const budget = this.snapshot.availableReaperETH +
        (this.snapshot.reaperBalance > this.snapshot.availableReaperETH
          ? this.snapshot.reaperBalance - this.snapshot.availableReaperETH
          : 0n);
      this.snapshot = {
        ...this.snapshot,
        availableReaperETH: 0n,
        auction: {
          id: 1n,
          ethBudget: budget,
          ethRemaining: budget,
          startTime: this.snapshot.now,
          endTime: this.snapshot.now + 7n,
          active: true,
        },
      };
    }
    return (
      this.receipts[call.action] ?? {
        tx: `0x${'ab'.repeat(32)}`,
        blockNumber: 10n,
        gasUsed: 10n,
        effectiveGasPrice: 10n,
        l1Fee: 50n,
        status: 'success',
        detail: {},
      }
    );
  }
}

function silentLogger(): Logger {
  return { info() {}, warn() {}, error() {} };
}

function tempLog(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nether-keeper-'));
  return path.join(dir, 'keeper-gas.jsonl');
}

function records(filePath: string): GasRecord[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as GasRecord);
}

async function tick(port: StubPort, over: { dryRun?: boolean; policy?: Policy } = {}) {
  const gasLog = tempLog();
  const store = openGasLog(gasLog);
  const state: CrankState = { lastFeeWei: 0n };
  const result = await runTick({
    port,
    policy: over.policy ?? policy,
    store,
    log: silentLogger(),
    dryRun: over.dryRun ?? false,
    chainId: 8453,
    hasOperator: true,
    state,
  });
  return { ...result, store, gasLog, state };
}

describe('runTick', () => {
  it('does not call send on dry-run', async () => {
    const port = new StubPort(
      snap({ harvestableYield: 1_000n, currentNAV: 10n ** 18n + 1_000n, availableReaperETH: 0n }),
    );
    const { attempts } = await tick(port, { dryRun: true });
    assert.equal(port.sent.length, 0);
    assert.ok(attempts.some((item) => item.outcome === 'would_send' && item.action === 'harvest'));
  });

  it('does not call send when simulation fails', async () => {
    const port = new StubPort(snap({ harvestableYield: 1_000n, currentNAV: 10n ** 18n + 1_000n }));
    port.simulateMap.harvest = {
      ok: false,
      errorName: 'ZeroHarvest',
      message: 'ZeroHarvest',
      expected: true,
    };
    const { attempts } = await tick(port);
    assert.deepEqual(port.sent, []);
    assert.equal(attempts.find((item) => item.action === 'harvest')?.skipReason, 'revert:ZeroHarvest');
  });

  it('refreshes the snapshot after finalize so start can run', async () => {
    const port = new StubPort(
      snap({
        now: 100n,
        auction: {
          id: 3n,
          ethBudget: 1_000n,
          ethRemaining: 1_000n,
          startTime: 1n,
          endTime: 50n,
          active: true,
        },
        availableReaperETH: 0n,
        reaperBalance: 1_000n,
      }),
    );
    const { attempts } = await tick(port);
    assert.deepEqual(port.sent, ['finalizeAuction', 'startAuction']);
    assert.equal(attempts[0]?.outcome, 'sent');
    assert.equal(attempts[1]?.outcome, 'sent');
    assert.equal(port.snapshot.auction.active, true);
  });

  it('records feeWei as gasUsed * effectiveGasPrice + l1Fee', async () => {
    const port = new StubPort(snap({ harvestableYield: 1_000n, currentNAV: 10n ** 18n + 1_000n }));
    const { gasLog } = await tick(port);
    const harvest = records(gasLog).find((row) => row.action === 'harvest' && row.sent);
    assert.ok(harvest);
    const gasUsed = BigInt(harvest.gasUsed ?? '0');
    const price = BigInt(harvest.effectiveGasPrice ?? '0');
    const l1 = BigInt(harvest.l1Fee);
    assert.equal(BigInt(harvest.feeWei), gasUsed * price + l1);
    assert.equal(BigInt(harvest.feeWei), 150n);
  });

  it('grows lifetime only when sent is true', async () => {
    const port = new StubPort(snap({ harvestableYield: 10n, currentNAV: 10n ** 18n + 10n }));
    const { store, gasLog } = await tick(port);
    assert.equal(store.lifetimeFeeWei, 0n);
    assert.equal(
      records(gasLog).some((row) => row.action === 'harvest' && row.skipReason === 'below_fee_floor'),
      true,
    );

    const port2 = new StubPort(snap({ harvestableYield: 1_000n, currentNAV: 10n ** 18n + 1_000n }));
    const second = await tick(port2);
    assert.equal(second.store.lifetimeFeeWei > 0n, true);
    const reopened = openGasLog(second.gasLog);
    assert.equal(reopened.lifetimeFeeWei, second.store.lifetimeFeeWei);
  });

  it('skips an expected revert on send without throwing', async () => {
    const port = new StubPort(snap({ harvestableYield: 1_000n, currentNAV: 10n ** 18n + 1_000n }));
    port.sendErrors.harvest = 'NoHarvestableYield';
    const { attempts } = await tick(port);
    assert.deepEqual(port.sent, ['harvest']);
    assert.equal(attempts[0]?.outcome, 'skip');
    assert.equal(attempts[0]?.skipReason, 'revert:NoHarvestableYield');
  });

  it('recovers listed adapters before harvest and continues after a failed recover', async () => {
    const first = '0x00000000000000000000000000000000000000aa' as Address;
    const second = '0x00000000000000000000000000000000000000bb' as Address;
    const port = new StubPort(
      snap({
        harvestableYield: 1_000n,
        currentNAV: 6n * 10n ** 17n + 1_000n,
        protectedPrincipal: 10n ** 18n,
        impairedCapital: 4n * 10n ** 17n,
        requiredBacking: 6n * 10n ** 17n,
        impairedAdapters: [
          { adapter: first, owed: 3n * 10n ** 17n },
          { adapter: second, owed: 1n * 10n ** 17n },
        ],
      }),
    );
    port.recoverSimulates[first.toLowerCase()] = {
      ok: false,
      errorName: 'ZeroRecover',
      message: 'ZeroRecover',
      expected: true,
    };
    const { attempts, gasLog } = await tick(port);
    assert.deepEqual(port.sent, ['recoverImpaired', 'harvest']);
    assert.equal(
      attempts.find((item) => item.action === 'recoverImpaired' && item.adapter === first)?.skipReason,
      'revert:ZeroRecover',
    );
    assert.equal(
      attempts.find((item) => item.action === 'recoverImpaired' && item.adapter === second)?.outcome,
      'sent',
    );
    assert.equal(attempts.find((item) => item.action === 'harvest')?.outcome, 'sent');
    assert.equal(
      records(gasLog).some((row) => row.action === 'recoverImpaired' && row.sent),
      true,
    );
  });

  it('does not send recoverImpaired when simulation would not increase Grave ETH', async () => {
    const adapter = '0x00000000000000000000000000000000000000aa' as Address;
    const port = new StubPort(
      snap({
        impairedCapital: 1n,
        requiredBacking: 10n ** 18n - 1n,
        impairedAdapters: [{ adapter, owed: 1n }],
      }),
    );
    port.recoverSimulates[adapter.toLowerCase()] = {
      ok: true,
      sizeWei: 0n,
      detail: { adapter, ethReceived: '0' },
    };
    const { attempts } = await tick(port);
    assert.deepEqual(port.sent, []);
    assert.equal(
      attempts.find((item) => item.action === 'recoverImpaired')?.skipReason,
      'no_eth_increase',
    );
  });

  it('skips recover dust against minRecoverWei without applying the harvest fee floor', async () => {
    const adapter = '0x00000000000000000000000000000000000000aa' as Address;
    const port = new StubPort(
      snap({
        impairedCapital: 50n,
        requiredBacking: 10n ** 18n - 50n,
        impairedAdapters: [{ adapter, owed: 50n }],
      }),
    );
    const { attempts } = await tick(port, { policy: { ...policy, minRecoverWei: 100n } });
    assert.deepEqual(port.sent, []);
    assert.equal(attempts.find((item) => item.action === 'recoverImpaired')?.skipReason, 'below_min_recover');
  });
});
