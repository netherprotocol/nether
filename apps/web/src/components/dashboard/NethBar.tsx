import { ChevronDown, Gem, Globe } from 'lucide-react';
import type { DeploymentContracts } from '../../lib/deployments.ts';
import { formatNeth } from '../../lib/format.ts';
import {
  NETWORK_ORDER,
  NETWORKS,
  type NetworkConfig,
  type NetworkId,
} from '../../lib/networks.ts';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { AddressLink, Tip } from './ui.tsx';

export function NethBar({
  snapshot,
  network,
  contracts,
  detailsOpen,
  onToggleDetails,
  onSelectNetwork,
}: {
  snapshot: ProtocolSnapshot | null;
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onSelectNetwork: (id: NetworkId) => void;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#0c0c0c] px-5 py-4 md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex min-w-[11rem] items-start gap-3">
          <Gem className="mt-0.5 h-6 w-6 text-accent" strokeWidth={1.25} aria-hidden="true" />
          <div>
            <h2 className="text-[0.78rem] tracking-[0.22em] text-accent uppercase">$NETH</h2>
            <p className="mt-1 text-sm text-muted">ERC-20 token on Base</p>
          </div>
        </div>

        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Network</p>
            <div className="mt-2 inline-flex rounded-md border border-white/10 p-0.5" role="group" aria-label="Network">
              {NETWORK_ORDER.map((id) => {
                const item = NETWORKS[id];
                const selected = network.id === id;
                const button = (
                  <button
                    key={id}
                    type="button"
                    disabled={!item.enabled}
                    aria-disabled={!item.enabled}
                    aria-pressed={selected}
                    title={item.enabled ? item.name : item.disabledReason}
                    onClick={() => {
                      if (item.enabled) {
                        onSelectNetwork(id);
                      }
                    }}
                    className={[
                      'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.68rem] tracking-[0.08em] uppercase',
                      selected ? 'bg-accent text-white' : 'text-muted',
                      item.enabled ? 'cursor-pointer hover:text-white' : 'pointer-events-none cursor-not-allowed opacity-50',
                    ].join(' ')}
                  >
                    <span className="h-2 w-2 rounded-full bg-[#0052FF]" aria-hidden="true" />
                    {item.name}
                  </button>
                );
                if (item.enabled) {
                  return button;
                }
                return (
                  <Tip key={id} text={item.disabledReason ?? 'Unavailable'}>
                    {button}
                  </Tip>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Total supply</p>
            <p className="mt-2 text-sm text-white">{snapshot ? formatNeth(snapshot.nethSupply) : '—'}</p>
          </div>
          <div>
            <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Contract address</p>
            <p className="mt-2">
              {contracts ? <AddressLink address={contracts.neth} network={network} /> : '—'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1 self-start border border-white/15 px-3 py-2 text-[0.65rem] tracking-[0.16em] text-paper uppercase lg:ml-auto"
          aria-expanded={detailsOpen}
          onClick={onToggleDetails}
        >
          Contract details
          <ChevronDown
            className={detailsOpen ? 'h-3.5 w-3.5 rotate-180' : 'h-3.5 w-3.5'}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </button>
      </div>

      {detailsOpen ? (
        <dl className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
            <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Grave</dt>
            <dd className="mt-1">
              {contracts ? <AddressLink address={contracts.grave} network={network} /> : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Reaper</dt>
            <dd className="mt-1">
              {contracts ? <AddressLink address={contracts.reaper} network={network} /> : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">Adapter</dt>
            <dd className="mt-1">
              {contracts ? <AddressLink address={contracts.adapter} network={network} /> : '—'}
            </dd>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Globe className="h-4 w-4 text-accent" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-muted">{network.name}</span>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
