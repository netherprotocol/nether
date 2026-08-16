import { CopyRow, Overlay } from './ui.tsx';
import type { NetworkConfig } from '../../lib/networks.ts';
import { nethManualGuide } from '../../lib/token.ts';
import type { Address } from 'viem';

export function TokenGuide({
  network,
  address,
  onClose,
}: {
  network: NetworkConfig;
  address: Address;
  onClose: () => void;
}) {
  const guide = nethManualGuide(network, address);
  return (
    <Overlay title={`Add $NETH on ${guide.networkName}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        Import the token on {guide.networkName} (chain {guide.chainId}). Do not import this address
        onto a different network.
      </p>
      <CopyRow label="Network" value={guide.networkName} />
      <CopyRow label="Token contract" value={guide.address} href={guide.explorerUrl} />
      <CopyRow label="Symbol" value={guide.symbol} />
      <CopyRow label="Decimals" value={String(guide.decimals)} />
      <p className="mt-4 text-sm text-paper">{guide.generic}</p>
      <ul className="mt-3 space-y-1.5 text-xs text-muted">
        <li>MetaMask: {guide.metamask}</li>
        <li>Coinbase Wallet: {guide.coinbase}</li>
        <li>Trust Wallet: {guide.trust}</li>
      </ul>
    </Overlay>
  );
}
