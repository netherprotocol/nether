import type { Address } from 'viem';
import type { NetworkId } from './networks.ts';
import type { AuctionSnapshot, ProtocolSnapshot } from './protocol.ts';

export const SNAPSHOT_STORAGE_PREFIX = 'nether.snapshot.';

export type SnapshotStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type SerializedAuction = {
  id: string;
  ethBudget: string;
  ethRemaining: string;
  snapshottedRewardRate: string;
  startTime: string;
  endTime: string;
  nethBurned: string;
  active: boolean;
};

type SerializedImpaired = {
  adapter: string;
  owed: string;
};

type SerializedSnapshot = {
  now: string;
  protectedPrincipal: string;
  requiredBacking: string;
  impairedCapital: string;
  impairedAdapters: SerializedImpaired[];
  pendingWithdrawFailures: string;
  lastMigrationFailureTime: string;
  nethSupply: string;
  currentEra: string;
  currentEraBuried: string;
  currentEraCapacity: string;
  currentRewardRate: string;
  quoteBuryOneEth: string;
  harvestableYield: string;
  currentNAV: string;
  activeStrategy: string;
  pendingAdapter: string;
  pendingExecuteAfter: string;
  availableReaperETH: string;
  auction: SerializedAuction;
  currentReaperRate: string;
  totalNethReaped: string;
  totalHarvestedETH: string;
};

export function snapshotStorageKey(networkId: NetworkId): string {
  return `${SNAPSHOT_STORAGE_PREFIX}${networkId}`;
}

export function serializeSnapshot(snapshot: ProtocolSnapshot): SerializedSnapshot {
  return {
    now: snapshot.now.toString(),
    protectedPrincipal: snapshot.protectedPrincipal.toString(),
    requiredBacking: snapshot.requiredBacking.toString(),
    impairedCapital: snapshot.impairedCapital.toString(),
    impairedAdapters: snapshot.impairedAdapters.map((entry) => ({
      adapter: entry.adapter,
      owed: entry.owed.toString(),
    })),
    pendingWithdrawFailures: snapshot.pendingWithdrawFailures.toString(),
    lastMigrationFailureTime: snapshot.lastMigrationFailureTime.toString(),
    nethSupply: snapshot.nethSupply.toString(),
    currentEra: snapshot.currentEra.toString(),
    currentEraBuried: snapshot.currentEraBuried.toString(),
    currentEraCapacity: snapshot.currentEraCapacity.toString(),
    currentRewardRate: snapshot.currentRewardRate.toString(),
    quoteBuryOneEth: snapshot.quoteBuryOneEth.toString(),
    harvestableYield: snapshot.harvestableYield.toString(),
    currentNAV: snapshot.currentNAV.toString(),
    activeStrategy: snapshot.activeStrategy,
    pendingAdapter: snapshot.pendingAdapter,
    pendingExecuteAfter: snapshot.pendingExecuteAfter.toString(),
    availableReaperETH: snapshot.availableReaperETH.toString(),
    auction: {
      id: snapshot.auction.id.toString(),
      ethBudget: snapshot.auction.ethBudget.toString(),
      ethRemaining: snapshot.auction.ethRemaining.toString(),
      snapshottedRewardRate: snapshot.auction.snapshottedRewardRate.toString(),
      startTime: snapshot.auction.startTime.toString(),
      endTime: snapshot.auction.endTime.toString(),
      nethBurned: snapshot.auction.nethBurned.toString(),
      active: snapshot.auction.active,
    },
    currentReaperRate: snapshot.currentReaperRate.toString(),
    totalNethReaped: snapshot.totalNethReaped.toString(),
    totalHarvestedETH: snapshot.totalHarvestedETH.toString(),
  };
}

export function deserializeSnapshot(raw: unknown): ProtocolSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Partial<SerializedSnapshot>;
  const auction = deserializeAuction(value.auction);
  const activeStrategy = asAddress(value.activeStrategy);
  const pendingAdapter = asAddress(value.pendingAdapter);
  if (!auction || !activeStrategy || !pendingAdapter) {
    return null;
  }
  const now = asBigInt(value.now);
  const protectedPrincipal = asBigInt(value.protectedPrincipal);
  const requiredBacking = optionalBig(value.requiredBacking, protectedPrincipal);
  const impairedCapital = optionalBig(value.impairedCapital, 0n);
  const pendingWithdrawFailures = optionalBig(value.pendingWithdrawFailures, 0n);
  const lastMigrationFailureTime = optionalBig(value.lastMigrationFailureTime, 0n);
  const impairedAdapters = deserializeImpaired(value.impairedAdapters);
  const nethSupply = asBigInt(value.nethSupply);
  const currentEra = asBigInt(value.currentEra);
  const currentEraBuried = asBigInt(value.currentEraBuried);
  const currentEraCapacity = asBigInt(value.currentEraCapacity);
  const currentRewardRate = asBigInt(value.currentRewardRate);
  const quoteBuryOneEth = asBigInt(value.quoteBuryOneEth);
  const harvestableYield = asBigInt(value.harvestableYield);
  const currentNAV = asBigInt(value.currentNAV);
  const pendingExecuteAfter = asBigInt(value.pendingExecuteAfter);
  const availableReaperETH = asBigInt(value.availableReaperETH);
  const currentReaperRate = asBigInt(value.currentReaperRate);
  const totalNethReaped = asBigInt(value.totalNethReaped);
  const totalHarvestedETH = asBigInt(value.totalHarvestedETH);
  if (
    now == null ||
    protectedPrincipal == null ||
    requiredBacking == null ||
    impairedCapital == null ||
    pendingWithdrawFailures == null ||
    lastMigrationFailureTime == null ||
    impairedAdapters == null ||
    nethSupply == null ||
    currentEra == null ||
    currentEraBuried == null ||
    currentEraCapacity == null ||
    currentRewardRate == null ||
    quoteBuryOneEth == null ||
    harvestableYield == null ||
    currentNAV == null ||
    pendingExecuteAfter == null ||
    availableReaperETH == null ||
    currentReaperRate == null ||
    totalNethReaped == null ||
    totalHarvestedETH == null
  ) {
    return null;
  }
  return {
    now,
    protectedPrincipal,
    requiredBacking,
    impairedCapital,
    impairedAdapters,
    pendingWithdrawFailures,
    lastMigrationFailureTime,
    nethSupply,
    currentEra,
    currentEraBuried,
    currentEraCapacity,
    currentRewardRate,
    quoteBuryOneEth,
    harvestableYield,
    currentNAV,
    activeStrategy,
    pendingAdapter,
    pendingExecuteAfter,
    availableReaperETH,
    auction,
    currentReaperRate,
    totalNethReaped,
    totalHarvestedETH,
  };
}

export function loadCachedSnapshot(
  networkId: NetworkId,
  store: SnapshotStore | undefined = browserStore(),
): ProtocolSnapshot | null {
  if (!store) {
    return null;
  }
  try {
    const raw = store.getItem(snapshotStorageKey(networkId));
    if (!raw) {
      return null;
    }
    return deserializeSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveCachedSnapshot(
  networkId: NetworkId,
  snapshot: ProtocolSnapshot,
  store: SnapshotStore | undefined = browserStore(),
): void {
  if (!store) {
    return;
  }
  try {
    store.setItem(snapshotStorageKey(networkId), JSON.stringify(serializeSnapshot(snapshot)));
  } catch {
    // Quota or private-mode failures must not break live reads.
  }
}

function browserStore(): SnapshotStore | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function deserializeAuction(raw: unknown): AuctionSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Partial<SerializedAuction>;
  const id = asBigInt(value.id);
  const ethBudget = asBigInt(value.ethBudget);
  const ethRemaining = asBigInt(value.ethRemaining);
  const snapshottedRewardRate = asBigInt(value.snapshottedRewardRate);
  const startTime = asBigInt(value.startTime);
  const endTime = asBigInt(value.endTime);
  const nethBurned = asBigInt(value.nethBurned);
  if (
    id == null ||
    ethBudget == null ||
    ethRemaining == null ||
    snapshottedRewardRate == null ||
    startTime == null ||
    endTime == null ||
    nethBurned == null ||
    typeof value.active !== 'boolean'
  ) {
    return null;
  }
  return {
    id,
    ethBudget,
    ethRemaining,
    snapshottedRewardRate,
    startTime,
    endTime,
    nethBurned,
    active: value.active,
  };
}

function deserializeImpaired(raw: unknown): { adapter: Address; owed: bigint }[] | null {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return null;
  }
  const entries: { adapter: Address; owed: bigint }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const value = item as Partial<SerializedImpaired>;
    const adapter = asAddress(value.adapter);
    const owed = asBigInt(value.owed);
    if (!adapter || owed == null) {
      return null;
    }
    entries.push({ adapter, owed });
  }
  return entries;
}

function optionalBig(value: unknown, fallback: bigint | null): bigint | null {
  if (value === undefined) {
    return fallback;
  }
  return asBigInt(value);
}

function asBigInt(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    return null;
  }
  return BigInt(value);
}

function asAddress(value: unknown): Address | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return null;
  }
  return value as Address;
}
