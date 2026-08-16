import { ArrowDown, Info, Skull } from 'lucide-react';
import { useState } from 'react';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import {
  formatAmountInput,
  formatDuration,
  formatEth,
  formatEthPerNeth,
  formatNeth,
  formatWei,
  parseAmount,
} from '../../lib/format.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { DEFAULT_SLIPPAGE_BPS, minOutFromQuote } from '../../lib/slippage.ts';
import { AddressLink, ActionFeedback, SlippageControl, StatRow, StatusDot, Tip, TokenChip } from './ui.tsx';
import { accentButtonClass } from '../wallet/ui.tsx';

const RATE_TIP =
  'The Reaper pays ETH for NETH along a 7-day reverse Dutch auction from 2.00× to 1.05× the snapshotted era rate (NETH per ETH). Waiting may improve the rate, but others can consume the budget first.';

export function ReaperPanel({
  snapshot,
  network,
  contracts,
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
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
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
}) {
  const auction = snapshot?.auction;
  const active = auction?.active === true;
  const expired = Boolean(active && snapshot && snapshot.now >= auction.endTime);
  const remaining = active && snapshot ? (auction.endTime > snapshot.now ? auction.endTime - snapshot.now : 0n) : 0n;
  const idleBudget = snapshot?.availableReaperETH ?? 0n;
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
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
                {showNeth ? (
                  <button
                    type="button"
                    className="normal-case tracking-normal text-accent hover:text-white"
                    onClick={() => onSellInput(formatAmountInput(nethBalance))}
                  >
                    Balance: {formatWei(nethBalance, 4)} NETH
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
            <p className="mt-3 text-xs text-muted">
              Current rate: {snapshot ? formatEthPerNeth(snapshot.currentReaperRate) : '—'}
            </p>
            <p className="mt-2 text-[0.72rem] leading-relaxed text-muted">
              Waiting may improve the rate, but others can consume the budget. Unused NETH stays with
              you if the auction only fills part of the sale.
            </p>
            <SlippageControl bps={slippageBps} onChange={setSlippageBps} />
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
              <p className="mt-2 text-xs text-muted">Exact NETH allowance for this sale. Approve is a separate transaction.</p>
            ) : null}
            <ActionFeedback
              pending={pending === 'approve' || pending === 'sell' ? pending : null}
              error={reaperFeedback ? error : null}
              hash={reaperFeedback ? hash : null}
              network={network}
            />
          </div>
        ) : active && expired ? (
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
        ) : idleBudget > 0n ? (
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
