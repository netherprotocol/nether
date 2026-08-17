import { ArrowDown, Skull } from 'lucide-react';
import { useState } from 'react';
import {
  formatAmountInput,
  formatEth,
  formatEthPerNeth,
  formatWei,
  parseAmount,
} from '../../lib/format.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { DEFAULT_SLIPPAGE_BPS, minOutFromQuote } from '../../lib/slippage.ts';
import { accentButtonClass } from '../wallet/ui.tsx';
import { ActionFeedback, AmountPercents, SlippageControl, TokenChip } from './ui.tsx';

export type ReaperActionsProps = {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  sellInput: string;
  sellQuote: bigint | null;
  onSellInput: (value: string) => void;
  connected: boolean;
  onChain: boolean;
  nethBalance: bigint | null;
  nethAllowance: bigint | null;
  pending: string | null;
  error: string | null;
  hash: string | null;
  lastAction: string | null;
  onApprove: (amount: bigint) => Promise<'ok' | 'rejected' | 'error' | 'busy'>;
  onSell: (amount: bigint, minEthOut: bigint) => Promise<'ok' | 'rejected' | 'error' | 'busy'>;
  onStart: () => Promise<'ok' | 'rejected' | 'error' | 'busy'>;
  onFinalize: () => Promise<'ok' | 'rejected' | 'error' | 'busy'>;
  layout: 'desktop' | 'mobile';
};

export function ReaperActions({
  snapshot,
  network,
  sellInput,
  sellQuote,
  onSellInput,
  connected,
  onChain,
  nethBalance,
  nethAllowance,
  pending,
  error,
  hash,
  lastAction,
  onApprove,
  onSell,
  onStart,
  onFinalize,
  layout,
}: ReaperActionsProps) {
  const auction = snapshot?.auction;
  const active = auction?.active === true;
  const expired = Boolean(active && snapshot && snapshot.now >= auction.endTime);
  const idleBudget = snapshot?.availableReaperETH ?? 0n;
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [slippageOpen, setSlippageOpen] = useState(false);
  const amount = parseAmount(sellInput) ?? 0n;
  const minEthOut = sellQuote != null ? minOutFromQuote(sellQuote, slippageBps) : 0n;
  const showNeth = connected && onChain && nethBalance != null;
  const needsApprove = nethAllowance != null && amount > 0n && nethAllowance < amount;
  const canSell =
    connected &&
    onChain &&
    active &&
    !expired &&
    amount > 0n &&
    nethBalance != null &&
    amount <= nethBalance &&
    sellQuote != null &&
    sellQuote > 0n &&
    pending == null;
  const canStart = connected && onChain && !active && idleBudget > 0n && pending == null;
  const canFinalize = connected && onChain && active && expired && pending == null;
  const reaperFeedback =
    lastAction === 'approve' || lastAction === 'sell' || lastAction === 'start' || lastAction === 'finalize';
  const mobile = layout === 'mobile';
  const rateLabel = snapshot ? formatEthPerNeth(snapshot.currentReaperRate) : '—';

  if (active && !expired) {
    return (
      <div>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-[0.68rem] tracking-[0.12em] text-muted uppercase">
            {mobile ? 'You pay' : 'You sell'}
            {showNeth ? (
              <button
                type="button"
                className="normal-case tracking-normal text-accent hover:text-white"
                onClick={() => onSellInput(formatAmountInput(nethBalance))}
              >
                {mobile ? 'Max' : `Balance: ${formatWei(nethBalance, 4)} NETH`}
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
              value={sellInput}
              onChange={(event) => onSellInput(event.target.value)}
              aria-label="NETH to sell"
            />
            <TokenChip label="$NETH" neth />
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
        {mobile ? (
          <AmountPercents
            max={nethBalance ?? 0n}
            disabled={!showNeth}
            onSelect={onSellInput}
            onSettings={() => setSlippageOpen((value) => !value)}
          />
        ) : null}
        {mobile ? (
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
            <span>{rateLabel}</span>
            <span>Slippage: {slippageBps / 100}%</span>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">Current rate: {rateLabel}</p>
        )}
        {mobile ? null : (
          <p className="mt-2 text-[0.72rem] leading-relaxed text-muted">
            Waiting may improve the rate, but others can consume the budget. Unused NETH stays with
            you if the auction only fills part of the sale.
          </p>
        )}
        {mobile && slippageOpen ? <SlippageControl bps={slippageBps} onChange={setSlippageBps} /> : null}
        {mobile ? null : <SlippageControl bps={slippageBps} onChange={setSlippageBps} />}
        <button
          type="button"
          disabled={!canSell}
          className={accentButtonClass(!canSell, 'mt-4')}
          onClick={() => {
            if (needsApprove) {
              void onApprove(amount);
            } else {
              void onSell(amount, minEthOut);
            }
          }}
        >
          {needsApprove ? 'Approve NETH' : 'Sell NETH'}
        </button>
        {needsApprove ? (
          <p className="mt-2 text-xs text-muted">
            Exact NETH allowance for this sale. Approve is a separate transaction.
          </p>
        ) : null}
        {mobile ? (
          <p className="mt-3 text-[0.72rem] leading-relaxed text-muted">
            Waiting may improve the rate, but others can consume the budget. Unused NETH stays with
            you if the auction only fills part of the sale.
          </p>
        ) : null}
        <ActionFeedback
          pending={pending === 'approve' || pending === 'sell' ? pending : null}
          error={reaperFeedback ? error : null}
          hash={reaperFeedback ? hash : null}
          network={network}
        />
      </div>
    );
  }

  if (active && expired) {
    return (
      <div className="flex flex-col justify-center rounded-lg border border-white/10 bg-black/30 px-6 py-10">
        <p className="text-sm tracking-[0.18em] text-accent uppercase">Auction ended</p>
        <p className="mt-3 text-sm text-muted">
          Finalize this auction before a new one can start. Anyone may call it; starting is disabled
          until finalize succeeds.
        </p>
        <button
          type="button"
          disabled={!canFinalize}
          className={accentButtonClass(!canFinalize, 'mt-6')}
          onClick={() => {
            void onFinalize();
          }}
        >
          Finalize auction
        </button>
        <ActionFeedback
          pending={pending === 'finalize' ? pending : null}
          error={lastAction === 'finalize' ? error : null}
          hash={lastAction === 'finalize' ? hash : null}
          network={network}
        />
      </div>
    );
  }

  if (idleBudget > 0n) {
    return (
      <div className="flex flex-col justify-center rounded-lg border border-white/10 bg-black/30 px-6 py-10">
        <p className="text-sm tracking-[0.18em] text-accent uppercase">Idle Reaper ETH</p>
        <p className="mt-2 font-display text-3xl text-white">{formatEth(idleBudget)}</p>
        <p className="mt-3 text-sm text-muted">
          Anyone may start this auction. The Grave keeper usually does. You pay gas. Starting
          snapshots the current era rate for a 7-day reverse Dutch auction. There is no protocol
          minimum budget.
        </p>
        <button
          type="button"
          disabled={!canStart}
          className={accentButtonClass(!canStart, 'mt-6')}
          onClick={() => {
            void onStart();
          }}
        >
          Start auction
        </button>
        <ActionFeedback
          pending={pending === 'start' ? pending : null}
          error={lastAction === 'start' ? error : null}
          hash={lastAction === 'start' ? hash : null}
          network={network}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-white/10 bg-black/30 px-6 py-12 text-center">
      <Skull className="h-10 w-10 text-accent" strokeWidth={1.25} aria-hidden="true" />
      <p className="mt-4 max-w-xs text-sm text-muted">No active auction. Check back when a new auction begins.</p>
    </div>
  );
}
