import { ChevronDown, Landmark, Skull } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { GraveStats } from './GraveStats.tsx';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';

export function MobileSwapCard({
  snapshot,
  network,
  contracts,
  bury,
  sell,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
  bury: ReactNode;
  sell: ReactNode;
}) {
  const [tab, setTab] = useState<'bury' | 'sell'>('bury');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const buryTab = tab === 'bury';

  return (
    <section className="rounded-xl border border-white/10 bg-[#0c0c0c] p-4 md:hidden">
      <header className="mb-4 flex items-start gap-3">
        {buryTab ? (
          <Landmark className="mt-0.5 h-6 w-6 text-accent" strokeWidth={1.25} aria-hidden="true" />
        ) : (
          <Skull className="mt-0.5 h-6 w-6 text-accent" strokeWidth={1.25} aria-hidden="true" />
        )}
        <div>
          <h2 className="text-[0.78rem] tracking-[0.22em] text-accent uppercase">
            {buryTab ? 'Grave' : 'Reaper'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {buryTab ? 'Bury ETH to earn $NETH' : 'Sell $NETH for ETH via reverse Dutch auction'}
          </p>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-black/50 p-1">
        <button
          type="button"
          onClick={() => setTab('bury')}
          className={[
            'py-2 text-[0.68rem] tracking-[0.18em] uppercase',
            buryTab ? 'bg-accent text-white' : 'text-muted',
          ].join(' ')}
        >
          Bury
        </button>
        <button
          type="button"
          onClick={() => setTab('sell')}
          className={[
            'py-2 text-[0.68rem] tracking-[0.18em] uppercase',
            buryTab ? 'text-muted' : 'bg-accent text-white',
          ].join(' ')}
        >
          Sell
        </button>
      </div>

      {buryTab ? bury : sell}

      {buryTab ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-[0.68rem] tracking-[0.14em] text-muted uppercase"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((value) => !value)}
          >
            Grave details
            <ChevronDown
              className={['h-4 w-4 transition-transform', detailsOpen ? 'rotate-180' : ''].join(' ')}
              strokeWidth={1.5}
            />
          </button>
          {detailsOpen ? (
            <div className="mt-3">
              <GraveStats snapshot={snapshot} network={network} contracts={contracts} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
