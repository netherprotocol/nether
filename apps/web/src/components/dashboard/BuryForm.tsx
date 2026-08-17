import { ArrowDown, Info } from 'lucide-react';
import { useState } from 'react';
import {
  formatAmountInput,
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
import { accentButtonClass } from '../wallet/ui.tsx';
import { ActionFeedback, AmountPercents, SlippageControl, Tip, TokenChip } from './ui.tsx';

export const BURY_WARNING =
  'Buried ETH is permanent. You cannot withdraw it. In exchange, the protocol mints NETH according to the current era. The Grave deploys its capital to earn yield, and harvestable yield funds the Reaper.';

export type BuryFormProps = {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
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
  layout: 'desktop' | 'mobile';
};

export function BuryForm({
  snapshot,
  network,
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
  layout,
}: BuryFormProps) {
  const amount = parseAmount(buryInput) ?? 0n;
  const segments = snapshot && amount > 0n ? splitBury(snapshot.currentEra, snapshot.currentEraBuried, amount) : [];
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [slippageOpen, setSlippageOpen] = useState(false);
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
  const mobile = layout === 'mobile';
  const rateLabel = snapshot
    ? mobile
      ? `1 ETH = ${formatWei(snapshot.quoteBuryOneEth, 6)} $NETH`
      : formatNethPerEth(snapshot.quoteBuryOneEth)
    : '—';

  return (
    <div>
      {mobile ? null : <p className="text-sm text-paper">Bury ETH in the Grave and receive $NETH</p>}
      <label className={mobile ? 'block' : 'mt-4 block'}>
        <span className="mb-1.5 flex items-center justify-between text-[0.68rem] tracking-[0.12em] text-muted uppercase">
          {mobile ? 'You pay' : 'You bury'}
          {showBalance ? (
            <button
              type="button"
              className="normal-case tracking-normal text-accent hover:text-white"
              onClick={() => onBuryInput(formatAmountInput(spendable))}
            >
              {mobile ? 'Max' : `Balance: ${formatWei(ethBalance, 4)} ETH`}
            </button>
          ) : (
            <span className="normal-case tracking-normal">{mobile ? '' : 'Balance: —'}</span>
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
      {mobile ? (
        <AmountPercents
          max={spendable}
          disabled={!showBalance}
          onSelect={onBuryInput}
          onSettings={() => setSlippageOpen((value) => !value)}
        />
      ) : null}
      {mobile ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            {rateLabel}
            <Tip text="Live quote from Grave.quoteBury(1 ETH).">
              <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
            </Tip>
          </span>
          <span>Slippage: {slippageBps / 100}%</span>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          Rate: {rateLabel}
          <Tip text="Live quote from Grave.quoteBury(1 ETH).">
            <Info className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          </Tip>
        </p>
      )}
      {mobile && slippageOpen ? <SlippageControl bps={slippageBps} onChange={setSlippageBps} /> : null}
      {mobile ? null : <SlippageControl bps={slippageBps} onChange={setSlippageBps} />}
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
    </div>
  );
}
