import type { DeploymentContracts } from '../../lib/deployments.ts';
import { explorerAddressUrl, type NetworkConfig } from '../../lib/networks.ts';

export function RpcDown({
  network,
  contracts,
  onRetry,
}: {
  network: NetworkConfig;
  contracts: DeploymentContracts | undefined;
  onRetry: () => void;
}) {
  const links = contracts
    ? [
        { label: 'Grave', href: explorerAddressUrl(network, contracts.grave) },
        { label: 'NETH', href: explorerAddressUrl(network, contracts.neth) },
        { label: 'Reaper', href: explorerAddressUrl(network, contracts.reaper) },
        { label: 'Adapter', href: explorerAddressUrl(network, contracts.adapter) },
      ]
    : [];

  return (
    <section className="mx-auto max-w-xl rounded-xl border border-white/10 bg-[#0c0c0c] px-6 py-12 text-center">
      <h1 className="font-display text-3xl text-white">{network.name} RPC is currently unavailable.</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Public RPC endpoints for {network.name} did not respond. You can inspect the contracts on{' '}
        {network.name === 'Base Sepolia' ? 'Sepolia Basescan' : 'Basescan'}, or wait until the Nether
        team resolves the issue.
      </p>
      {links.length > 0 ? (
        <ul className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
          {links.map((link) => (
            <li key={link.label}>
              <a
                className="text-accent underline decoration-accent/40 underline-offset-4 hover:text-white"
                href={link.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="mt-8 bg-accent px-5 py-2.5 text-[0.7rem] tracking-[0.22em] text-white uppercase"
        onClick={onRetry}
      >
        Retry
      </button>
    </section>
  );
}
