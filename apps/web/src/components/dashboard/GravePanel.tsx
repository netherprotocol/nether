import { ArrowDown, Info, Landmark } from 'lucide-react';
import { useState } from 'react';
import { zeroAddress } from 'viem';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import {
  eraProgressPercent,
  eraRemaining,
  formatAmountInput,
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
import { DEFAULT_SLIPPAGE_BPS, minOutFromQuote, spendableEth } from '../../lib/slippage.ts';
import { AddressLink, ActionFeedback, ProgressBar, SlippageControl, StatRow, Tip, TokenChip } from './ui.tsx';
import { accentButtonClass } from '../wallet/ui.tsx';

export const BURY_WARNING =
  'Buried ETH is permanent. You cannot withdraw it. In exchange, the protocol mints NETH according to the current era. The Grave deploys its capital to earn yield, and harvestable yield funds the Reaper.';

export function GravePanel({
  snapshot,
  network,
  contracts,
  buryInput,
  buryQuote,
  onBuryInput,
  connected,
  onChain,
  ethBalance,
  gasReserve,
  pending,
  error,
  hash,
  onBury,
  onAddNeth,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
  buryInput: string;
  buryQuote: bigint | null;
  onBuryInput: (value: string) => void;
  connected: boolean;
  onChain: boolean;
  ethBalance: bigint | null;
  gasReserve: bigint;
  pending: string | null;
  error: string | null;
  hash: string | null;
  onBury: (amount: bigint, minNethOut: bigint) => Promise<'ok' | 'rejected' | 'error' | 'busy'>;
  onAddNeth: () => Promise<'watched' | 'guide'>;
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
  const amount = parseAmount(buryInput) ?? 0n;
  const segments = snapshot && amount > 0n ? splitBury(snapshot.currentEra, snapshot.currentEraBuried, amount) : [];
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [promptAdd, setPromptAdd] = useState(false);
  const spendable = ethBalance != null ? spendableEth(ethBalance, gasReserve) : 0n;
  const minNethOut = buryQuote != null ? minOutFromQuote(buryQuote, slippageBps) : 0n;
  const canBury =
    connected &&
    onChain &&
    amount > 0n &&
    ethBalance != null &&
    amount <= spendable &&
    buryQuote != null &&
    buryQuote > 0n &&
    pending == null;
  const showBalance = connected && onChain && ethBalance != null;

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
              {showBalance ? (
                <button
                  type="button"
                  className="normal-case tracking-normal text-accent hover:text-white"
                  onClick={() => onBuryInput(formatAmountInput(spendable))}
                >
                  Balance: {formatWei(ethBalance, 4)} ETH
                </button>
              ) : (
                <span className="normal-case tracking-normal">Balance: —</span>
              )}
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
              <TokenChip label="$NETH" neth />
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
          <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
          {step === 'confirm' ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-paper">
              <p>ETH in: {formatEth(amount, 6)}</p>
              <p className="mt-1">Estimated NETH: {buryQuote ? formatNeth(buryQuote, 6) : '—'}</p>
              <p className="mt-1">
                Min NETH ({slippageBps / 100}% slippage): {formatNeth(minNethOut, 6)}
              </p>
              {segments.length > 1 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {segments.map((segment) => (
                    <li key={segment.era.toString()}>
                      Era {segment.era.toString()}: {formatEth(segment.eth, 6)} → {formatNeth(segment.neth, 4)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-[0.72rem] leading-relaxed text-muted">{BURY_WARNING}</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  className="flex-1 border border-white/20 py-3 text-[0.72rem] tracking-[0.22em] text-white uppercase"
                  onClick={() => setStep('form')}
                  disabled={pending === 'bury'}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={accentButtonClass(pending === 'bury', 'flex-1')}
                  disabled={pending === 'bury'}
                  onClick={() => {
                    void onBury(amount, minNethOut).then((result) => {
                      if (result === 'ok') {
                        setStep('form');
                        setPromptAdd(true);
                      }
                    });
                  }}
                >
                  Confirm bury
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!canBury}
              title={
                !connected
                  ? 'Connect a wallet to bury'
                  : !onChain
                    ? `Switch to ${network.walletChainName}`
                    : undefined
              }
              className={accentButtonClass(!canBury, 'mt-4')}
              onClick={() => setStep('confirm')}
            >
              Bury ETH
            </button>
          )}
          <ActionFeedback pending={pending === 'bury' ? pending : null} error={error} hash={hash} network={network} />
          {step === 'form' ? <p className="mt-3 text-[0.72rem] leading-relaxed text-muted">{BURY_WARNING}</p> : null}
          {promptAdd ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
              <p className="text-paper">NETH was minted to this wallet. Add $NETH to see it in the token list.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className={accentButtonClass(false, 'flex-1')}
                  onClick={() => {
                    void onAddNeth().then(() => setPromptAdd(false));
                  }}
                >
                  Add $NETH
                </button>
                <button
                  type="button"
                  className="flex-1 border border-white/20 py-3 text-[0.72rem] tracking-[0.22em] text-white uppercase"
                  onClick={() => setPromptAdd(false)}
                >
                  Skip
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
