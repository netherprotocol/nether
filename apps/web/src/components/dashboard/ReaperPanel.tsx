import { ArrowDown, Info, Skull } from 'lucide-react';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import {
  formatDuration,
  formatEth,
  formatEthPerNeth,
  formatNeth,
  formatWei,
} from '../../lib/format.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { AddressLink, StatRow, StatusDot, Tip, TokenChip } from './ui.tsx';

const RATE_TIP =
  'The Reaper pays ETH for NETH along a 7-day reverse Dutch auction from 2.00× to 1.05× the snapshotted era rate (NETH per ETH). Waiting may improve the rate, but others can consume the budget first.';

export function ReaperPanel({
  snapshot,
  network,
  contracts,
  sellInput,
  sellQuote,
  onSellInput,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
  sellInput: string;
  sellQuote: bigint | null;
  onSellInput: (value: string) => void;
}) {
  const auction = snapshot?.auction;
  const active = auction?.active === true;
  const expired = Boolean(active && snapshot && snapshot.now >= auction.endTime);
  const remaining = active && snapshot ? (auction.endTime > snapshot.now ? auction.endTime - snapshot.now : 0n) : 0n;

  return (
    <section className="rounded-xl border border-white/10 bg-[#0c0c0c] p-5 md:p-6">
      <header className="mb-5 flex items-start gap-3">
        <Skull className="mt-0.5 h-6 w-6 text-accent" strokeWidth={1.25} aria-hidden="true" />
        <div>
          <h2 className="text-[0.78rem] tracking-[0.22em] text-accent uppercase">Reaper</h2>
          <p className="mt-1 text-sm text-muted">Sell $NETH for ETH via reverse Dutch auction</p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
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
              {snapshot
                ? formatEth(active && auction ? auction.ethRemaining : snapshot.availableReaperETH)
                : '—'}
            </StatRow>
            {active && auction ? (
              <StatRow label="Auction budget">{formatEth(auction.ethBudget)}</StatRow>
            ) : null}
            {active && auction ? (
              <StatRow label="Time remaining">{expired ? '0s' : formatDuration(remaining)}</StatRow>
            ) : null}
            <StatRow label="Total NETH reaped">
              {snapshot ? formatNeth(snapshot.totalNethReaped) : '—'}
            </StatRow>
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

        {active && !expired ? (
          <div>
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-[0.68rem] tracking-[0.12em] text-muted uppercase">
                You sell
                <span className="normal-case tracking-normal">Balance: —</span>
              </span>
              <span className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-3">
                <input
                  className="min-w-0 flex-1 bg-transparent text-2xl font-light text-white outline-none"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={sellInput}
                  onChange={(event) => onSellInput(event.target.value)}
                  aria-label="NETH to sell"
                />
                <TokenChip label="$NETH" />
              </span>
            </label>
            <div className="my-2 flex justify-center text-muted">
              <ArrowDown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-[0.68rem] tracking-[0.12em] text-muted uppercase">
                You receive
                <span className="normal-case tracking-normal">estimated</span>
              </span>
              <span className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-3">
                <span className="min-w-0 flex-1 text-2xl font-light text-white">
                  {sellQuote && sellQuote > 0n ? formatWei(sellQuote, 6) : '0.0'}
                </span>
                <TokenChip label="ETH" />
              </span>
            </label>
            <p className="mt-3 text-xs text-muted">
              Current rate: {snapshot ? formatEthPerNeth(snapshot.currentReaperRate) : '—'}
            </p>
            <Tip block text="Wallet Reaper sales ship in a later release.">
              <button
                type="button"
                disabled
                className="mt-4 w-full cursor-not-allowed bg-accent py-3 text-[0.72rem] tracking-[0.22em] text-white uppercase"
              >
                Sell NETH
              </button>
            </Tip>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-white/10 bg-black/30 px-6 py-12 text-center">
            <Skull className="h-10 w-10 text-accent" strokeWidth={1.25} aria-hidden="true" />
            <p className="mt-4 max-w-xs text-sm text-muted">
              No active auction. Check back when a new auction begins.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
