import { Info } from 'lucide-react';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import { formatDuration, formatEth, formatEthPerNeth, formatNeth } from '../../lib/format.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { AddressLink, StatRow, StatusDot, Tip } from './ui.tsx';

const RATE_TIP =
  'The Reaper pays ETH for NETH along a 7-day reverse Dutch auction from 2.00× to 1.05× the snapshotted era rate (NETH per ETH). Waiting may improve the rate, but others can consume the budget first.';

export function ReaperStats({
  snapshot,
  network,
  contracts,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
}) {
  const auction = snapshot?.auction;
  const active = auction?.active === true;
  const expired = Boolean(active && snapshot && snapshot.now >= auction.endTime);
  const remaining = active && snapshot ? (auction.endTime > snapshot.now ? auction.endTime - snapshot.now : 0n) : 0n;

  return (
    <div>
      <div className="flex items-center gap-2 text-[0.68rem] tracking-[0.18em] uppercase">
        <StatusDot active={active && !expired} />
        <span className={active ? 'text-emerald-400' : 'text-muted'}>
          {active && !expired ? 'Auction active' : active ? 'Auction ended' : 'Inactive'}
        </span>
      </div>
      {active && !expired ? (
        <p className="mt-3 font-display text-3xl text-accent">
          {snapshot ? formatEthPerNeth(snapshot.currentReaperRate) : '—'}
        </p>
      ) : null}
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
        Reverse Dutch auction
        <Tip text={RATE_TIP}>
          <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        </Tip>
      </p>

      <div className="mt-4 divide-y divide-white/10">
        <StatRow label="Reaper ETH">
          {snapshot ? formatEth(active && auction ? auction.ethRemaining : snapshot.availableReaperETH) : '—'}
        </StatRow>
        {active && auction ? <StatRow label="Auction budget">{formatEth(auction.ethBudget)}</StatRow> : null}
        {active && auction ? (
          <StatRow label="Time remaining">{expired ? '0s' : formatDuration(remaining)}</StatRow>
        ) : null}
        <StatRow label="Total NETH reaped">{snapshot ? formatNeth(snapshot.totalNethReaped) : '—'}</StatRow>
        <StatRow label="Yield sent to Reaper">
          {snapshot ? formatEth(snapshot.totalHarvestedETH) : '—'}
        </StatRow>
        <StatRow label="Reaper contract">
          {contracts ? <AddressLink address={contracts.reaper} network={network} /> : '—'}
        </StatRow>
      </div>
      {active && !expired ? (
        <p className="mt-4 text-[0.72rem] leading-relaxed text-muted">
          Waiting may improve the rate, but the budget can be consumed by others.
        </p>
      ) : null}
    </div>
  );
}
