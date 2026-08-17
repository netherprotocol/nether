import { ChevronDown, Skull } from 'lucide-react';
import { useState } from 'react';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { ReaperActions } from './ReaperActions.tsx';
import { ReaperStats } from './ReaperStats.tsx';

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
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-white/10 bg-[#0c0c0c] p-5 md:p-6">
      <header className={['flex items-start gap-3', open ? 'mb-5' : 'md:mb-5'].join(' ')}>
        <button
          type="button"
          className="flex w-full items-start gap-3 text-left md:pointer-events-none md:contents"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Skull className="mt-0.5 h-6 w-6 text-accent" strokeWidth={1.25} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.78rem] tracking-[0.22em] text-accent uppercase">Reaper</h2>
            <p className="mt-1 text-sm text-muted">Sell $NETH for ETH via reverse Dutch auction</p>
          </div>
          <ChevronDown
            className={['mt-0.5 h-5 w-5 text-muted transition-transform md:hidden', open ? 'rotate-180' : ''].join(
              ' ',
            )}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </header>

      <div className={open ? 'grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]' : 'hidden md:grid md:gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]'}>
        <ReaperStats snapshot={snapshot} network={network} contracts={contracts} />
        <div className="max-md:hidden">
          <ReaperActions
            snapshot={snapshot}
            network={network}
            sellInput={sellInput}
            sellQuote={sellQuote}
            onSellInput={onSellInput}
            connected={connected}
            onChain={onChain}
            nethBalance={nethBalance}
            nethAllowance={nethAllowance}
            pending={pending}
            error={error}
            hash={hash}
            lastAction={lastAction}
            onApprove={onApprove}
            onSell={onSell}
            onStart={onStart}
            onFinalize={onFinalize}
            layout="desktop"
          />
        </div>
      </div>
    </section>
  );
}
