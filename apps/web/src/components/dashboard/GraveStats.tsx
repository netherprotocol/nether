import { Info } from 'lucide-react';
import { zeroAddress } from 'viem';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import {
  eraProgressPercent,
  eraRemaining,
  formatDuration,
  formatEth,
  formatNethPerEth,
} from '../../lib/format.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { AddressLink, ProgressBar, StatRow, Tip } from './ui.tsx';

export function GraveStats({
  snapshot,
  network,
  contracts,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
}) {
  const remaining = snapshot
    ? eraRemaining(snapshot.currentEraBuried, snapshot.currentEraCapacity)
    : 0n;
  const progress = snapshot
    ? eraProgressPercent(snapshot.currentEraBuried, snapshot.currentEraCapacity)
    : 0;
  const pendingStrategy = snapshot && snapshot.pendingAdapter !== zeroAddress;
  const pendingWait =
    snapshot && pendingStrategy
      ? snapshot.pendingExecuteAfter > snapshot.now
        ? snapshot.pendingExecuteAfter - snapshot.now
        : 0n
      : 0n;

  return (
    <div className="divide-y divide-white/10">
      <StatRow label="Total ETH buried">
        {snapshot ? formatEth(snapshot.protectedPrincipal) : '—'}
      </StatRow>
      <StatRow label="Bury quote">
        <span className="inline-flex items-center gap-1.5">
          {snapshot ? formatNethPerEth(snapshot.quoteBuryOneEth) : '—'}
          <Tip text="NETH minted per ETH at the current era rate. A bury that fills the era is split across the next era at half the rate.">
            <Info className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} aria-hidden="true" />
          </Tip>
        </span>
      </StatRow>
      <StatRow label="Current era">{snapshot ? snapshot.currentEra.toString() : '—'}</StatRow>
      <StatRow label="Era progress">{snapshot ? <ProgressBar percent={progress} /> : '—'}</StatRow>
      <StatRow label="ETH remaining in era">{snapshot ? formatEth(remaining) : '—'}</StatRow>
      <StatRow label="Harvestable yield">
        {snapshot ? formatEth(snapshot.harvestableYield) : '—'}
      </StatRow>
      <StatRow label="Strategy NAV">{snapshot ? formatEth(snapshot.currentNAV) : '—'}</StatRow>
      <StatRow label="Active strategy">
        {snapshot && snapshot.activeStrategy !== zeroAddress ? (
          <AddressLink address={snapshot.activeStrategy} network={network} />
        ) : (
          'None'
        )}
      </StatRow>
      {pendingStrategy && snapshot ? (
        <StatRow label="Pending strategy">
          <div>
            <span className="mb-1 inline-block rounded bg-accent/20 px-1.5 py-0.5 text-[0.62rem] tracking-[0.14em] text-accent uppercase">
              Pending
            </span>
            <div className="mt-1">
              <AddressLink address={snapshot.pendingAdapter} network={network} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {pendingWait > 0n ? `Activates in ${formatDuration(pendingWait)}` : 'Ready to activate'}
            </p>
          </div>
        </StatRow>
      ) : null}
      <StatRow label="Grave contract">
        {contracts ? <AddressLink address={contracts.grave} network={network} /> : '—'}
      </StatRow>
    </div>
  );
}
