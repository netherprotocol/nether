import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProtocolSnapshot } from './protocol.ts';
import {
  deserializeSnapshot,
  loadCachedSnapshot,
  saveCachedSnapshot,
  serializeSnapshot,
  snapshotStorageKey,
} from './snapshotCache.ts';

const SAMPLE: ProtocolSnapshot = {
  now: 1_700_000_000n,
  protectedPrincipal: 10n ** 18n,
  nethSupply: 50n * 10n ** 18n,
  currentEra: 0n,
  currentEraBuried: 10n ** 17n,
  currentEraCapacity: 10n * 10n ** 18n,
  currentRewardRate: 1_000_000n * 10n ** 18n,
  quoteBuryOneEth: 1_000_000n * 10n ** 18n,
  harvestableYield: 0n,
  currentNAV: 10n ** 18n,
  activeStrategy: '0x1111111111111111111111111111111111111111',
  pendingAdapter: '0x0000000000000000000000000000000000000000',
  pendingExecuteAfter: 0n,
  availableReaperETH: 2n * 10n ** 18n,
  auction: {
    id: 1n,
    ethBudget: 3n * 10n ** 18n,
    ethRemaining: 2n * 10n ** 18n,
    snapshottedRewardRate: 1_000_000n * 10n ** 18n,
    startTime: 1n,
    endTime: 2n,
    nethBurned: 0n,
    active: false,
  },
  currentReaperRate: 0n,
  totalNethReaped: 4n,
  totalHarvestedETH: 5n,
};

describe('snapshot cache', () => {
  it('round-trips bigint fields through JSON strings', () => {
    const restored = deserializeSnapshot(serializeSnapshot(SAMPLE));
    assert.deepEqual(restored, SAMPLE);
  });

  it('rejects corrupt payloads', () => {
    assert.equal(deserializeSnapshot(null), null);
    assert.equal(deserializeSnapshot({ now: '1' }), null);
    assert.equal(deserializeSnapshot({ ...serializeSnapshot(SAMPLE), now: '1.5' }), null);
  });

  it('stores and loads per network', () => {
    const memory = new Map<string, string>();
    const store = {
      getItem(key: string) {
        return memory.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        memory.set(key, value);
      },
    };
    saveCachedSnapshot('base-sepolia', SAMPLE, store);
    assert.equal(loadCachedSnapshot('base', store), null);
    assert.deepEqual(loadCachedSnapshot('base-sepolia', store), SAMPLE);
    assert.equal(snapshotStorageKey('base-sepolia'), 'nether.snapshot.base-sepolia');
  });
});
