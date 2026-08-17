import { Landmark } from 'lucide-react';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { BuryForm } from './BuryForm.tsx';
import { GraveStats } from './GraveStats.tsx';

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
}) {
  return (
    <section className="hidden rounded-xl border border-white/10 bg-[#0c0c0c] p-5 md:block md:p-6">
      <header className="mb-5 flex items-start gap-3">
        <Landmark className="mt-0.5 h-6 w-6 text-accent" strokeWidth={1.25} aria-hidden="true" />
        <div>
          <h2 className="text-[0.78rem] tracking-[0.22em] text-accent uppercase">Grave</h2>
          <p className="mt-1 text-sm text-muted">Bury ETH to earn $NETH</p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <GraveStats snapshot={snapshot} network={network} contracts={contracts} />
        <BuryForm
          snapshot={snapshot}
          network={network}
          buryInput={buryInput}
          buryQuote={buryQuote}
          onBuryInput={onBuryInput}
          connected={connected}
          onChain={onChain}
          ethBalance={ethBalance}
          gasReserve={gasReserve}
          pending={pending}
          error={error}
          hash={hash}
          onBury={onBury}
          layout="desktop"
        />
      </div>
    </section>
  );
}
