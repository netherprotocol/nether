import type { Address } from 'viem';

export type AuctionView = {
  id: bigint;
  ethBudget: bigint;
  ethRemaining: bigint;
  startTime: bigint;
  endTime: bigint;
  active: boolean;
};

export type ImpairedEntry = {
  adapter: Address;
  owed: bigint;
};

export type Snapshot = {
  chainId: number;
  blockNumber: bigint;
  now: bigint;
  harvestableYield: bigint;
  currentNAV: bigint;
  protectedPrincipal: bigint;
  requiredBacking: bigint;
  impairedCapital: bigint;
  impairedAdapters: ImpairedEntry[];
  pendingWithdrawFailures: bigint;
  lastMigrationFailureTime: bigint;
  activeStrategy: Address;
  graveReaper: Address;
  pendingAdapter: Address;
  pendingExecuteAfter: bigint;
  availableReaperETH: bigint;
  auction: AuctionView;
  reaperBalance: bigint;
  operatorBalance: bigint;
  harvestViewFailed: boolean;
  navViewFailed: boolean;
};

export function allocatedReaperEth(snapshot: Pick<Snapshot, 'availableReaperETH' | 'auction'>): bigint {
  return snapshot.availableReaperETH + (snapshot.auction.active ? snapshot.auction.ethRemaining : 0n);
}

export function surplusEth(snapshot: Pick<Snapshot, 'availableReaperETH' | 'auction' | 'reaperBalance'>): bigint {
  const allocated = allocatedReaperEth(snapshot);
  return snapshot.reaperBalance > allocated ? snapshot.reaperBalance - allocated : 0n;
}

export function startableEth(snapshot: Pick<Snapshot, 'availableReaperETH' | 'auction' | 'reaperBalance'>): bigint {
  if (snapshot.auction.active) {
    return 0n;
  }
  return snapshot.availableReaperETH + surplusEth(snapshot);
}
