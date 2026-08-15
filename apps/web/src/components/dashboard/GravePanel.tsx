import { ArrowDown, Gem, Info, Landmark } from 'lucide-react';
import { zeroAddress } from 'viem';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import {
  eraProgressPercent,
  eraRemaining,
  formatDuration,
  formatEth,
  formatNeth,
  formatNethPerEth,
  formatWei,
  parseAmount,
  splitBury,
} from '../../lib/format.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { AddressLink, ProgressBar, StatRow, Tip, TokenChip } from './ui.tsx';

const BURY_WARNING =
  'Buried ETH is permanent. You cannot withdraw it. In exchange, the protocol mints NETH according to the current era. The Grave deploys its capital to earn yield, and harvestable yield funds the Reaper.';

export function GravePanel({
  snapshot,
  network,
  contracts,
  buryInput,
  buryQuote,
  onBuryInput,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
  buryInput: string;
  buryQuote: bigint | null;
  onBuryInput: (value: string) => void;
}) {
  const remaining = snapshot
    ? eraRemaining(snapshot.currentEraBuried, snapshot.currentEraCapacity)
    : 0n;
  const progress = snapshot
    ? eraProgressPercent(snapshot.currentEraBuried, snapshot.currentEraCapacity)
    : 0;
  const pending = snapshot && snapshot.pendingAdapter !== zeroAddress;
  const pendingWait =
    snapshot && pending
      ? snapshot.pendingExecuteAfter > snapshot.now
        ? snapshot.pendingExecuteAfter - snapshot.now
        : 0n
      : 0n;
  const amount = parseAmount(buryInput) ?? 0n;
  const segments = snapshot && amount > 0n ? splitBury(snapshot.currentEra, snapshot.currentEraBuried, amount) : [];

  return (
    <section className="rounded-xl border border-white/10 bg-[#0c0c0c] p-5 md:p-6">
      <header className="mb-5 flex items-start gap-3">
        <Landmark className="mt-0.5 h-6 w-6 text-accent" strokeWidth={1.25} aria-hidden="true" />
        <div>
          <h2 className="text-[0.78rem] tracking-[0.22em] text-accent uppercase">Grave</h2>
          <p className="mt-1 text-sm text-muted">Bury ETH to earn $NETH</p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
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
          <StatRow label="Era progress">
            {snapshot ? <ProgressBar percent={progress} /> : '—'}
          </StatRow>
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
          {pending && snapshot ? (
            <StatRow label="Pending strategy">
              <div>
                <span className="mb-1 inline-block rounded bg-accent/20 px-1.5 py-0.5 text-[0.62rem] tracking-[0.14em] text-accent uppercase">
                  Pending
                </span>
                <div className="mt-1">
                  <AddressLink address={snapshot.pendingAdapter} network={network} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {pendingWait > 0n
                    ? `Activates in ${formatDuration(pendingWait)}`
                    : 'Ready to activate'}
                </p>
              </div>
            </StatRow>
          ) : null}
          <StatRow label="Grave contract">
            {contracts ? <AddressLink address={contracts.grave} network={network} /> : '—'}
          </StatRow>
        </div>

        <div>
          <p className="text-sm text-paper">Bury ETH in the Grave and receive $NETH</p>
          <label className="mt-4 block">
            <span className="mb-1.5 flex items-center justify-between text-[0.68rem] tracking-[0.12em] text-muted uppercase">
              You bury
              <span className="normal-case tracking-normal">Balance: —</span>
            </span>
            <span className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-3">
              <input
                className="min-w-0 flex-1 bg-transparent text-2xl font-light text-white outline-none"
                inputMode="decimal"
                placeholder="0.0"
                value={buryInput}
                onChange={(event) => onBuryInput(event.target.value)}
                aria-label="ETH to bury"
              />
              <TokenChip label="ETH" />
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
                {buryQuote && buryQuote > 0n ? formatWei(buryQuote, 6) : '0.0'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[0.68rem] tracking-[0.14em] text-paper uppercase">
                <Gem className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} aria-hidden="true" />
                $NETH
              </span>
            </span>
          </label>
          {segments.length > 1 ? (
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {segments.map((segment) => (
                <li key={segment.era.toString()}>
                  Era {segment.era.toString()}: {formatEth(segment.eth, 6)} → {formatNeth(segment.neth, 4)}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            Rate: {snapshot ? formatNethPerEth(snapshot.quoteBuryOneEth) : '—'}
            <Tip text="Live quote from Grave.quoteBury(1 ETH).">
              <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </Tip>
          </p>
          <Tip block text="Wallet burial ships in a later release.">
            <button
              type="button"
              disabled
              className="mt-4 w-full cursor-not-allowed bg-accent py-3 text-[0.72rem] tracking-[0.22em] text-white uppercase"
            >
              Bury ETH
            </button>
          </Tip>
          <p className="mt-3 text-[0.72rem] leading-relaxed text-muted">{BURY_WARNING}</p>
        </div>
      </div>
    </section>
  );
}
