import { Globe } from 'lucide-react';
import { NethMark } from '../NethMark.tsx';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import { formatNeth } from '../../lib/format.ts';
import type { NetworkConfig } from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { AddressLink } from './ui.tsx';

export function NethBar({
  snapshot,
  network,
  contracts,
  connected,
  onChain,
  nethBalance,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
  connected: boolean;
  onChain: boolean;
  nethBalance: bigint | null;
}) {
  const showBalance = connected && onChain && nethBalance != null;

  return (
    <section className="rounded-xl border border-white/10 bg-[#0c0c0c] px-5 py-4 md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex min-w-[11rem] items-start gap-3">
          <NethMark className="mt-0.5 h-6 w-6 text-accent" />
          <div>
            <h2 className="text-[0.78rem] tracking-[0.22em] text-accent uppercase">$NETH</h2>
            <p className="mt-1 text-sm text-muted">ERC-20 token on Base</p>
          </div>
        </div>

        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Total supply</p>
            <p className="mt-2 text-sm text-white">{snapshot ? formatNeth(snapshot.nethSupply) : '—'}</p>
          </div>
          <div>
            <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Your balance</p>
            <p className="mt-2 text-sm text-white">{showBalance ? formatNeth(nethBalance) : '—'}</p>
          </div>
          <div>
            <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Contract address</p>
            <p className="mt-2">
              {contracts ? <AddressLink address={contracts.neth} network={network} /> : '—'}
            </p>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Name</dt>
          <dd className="mt-1 text-white">Nether</dd>
        </div>
        <div>
          <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Symbol</dt>
          <dd className="mt-1 text-white">NETH</dd>
        </div>
        <div>
          <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Decimals</dt>
          <dd className="mt-1 text-white">18</dd>
        </div>
        <div>
          <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Chain ID</dt>
          <dd className="mt-1 text-white">{network.chainId}</dd>
        </div>
        <div>
          <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Network</dt>
          <dd className="mt-1 flex items-center gap-2 text-muted">
            <Globe className="h-4 w-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
            {network.name}
          </dd>
        </div>
      </dl>
    </section>
  );
}
