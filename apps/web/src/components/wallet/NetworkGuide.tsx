import { CopyRow, Overlay } from './ui.tsx';
import { manualNetworkGuide, type NetworkConfig } from '../../lib/networks.ts';

export function NetworkGuide({
  network,
  onClose,
}: {
  network: NetworkConfig;
  onClose: () => void;
}) {
  const guide = manualNetworkGuide(network);
  return (
    <Overlay title={`Add ${guide.chainName}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        This wallet does not support adding a network automatically. Copy these fields into the
        wallet’s custom network form.
      </p>
      <CopyRow label="Network name" value={guide.chainName} />
      <CopyRow label="Chain ID" value={`${guide.chainId} (${guide.chainIdHex})`} />
      <CopyRow label="RPC URL" value={guide.officialRpcUrl} />
      {guide.backupRpcUrls.map((url) => (
        <CopyRow key={url} label="Backup RPC" value={url} />
      ))}
      <CopyRow label="Explorer" value={guide.explorer} href={guide.explorer} />
      <CopyRow
        label="Currency"
        value={`${guide.nativeCurrency.name} (${guide.nativeCurrency.symbol}), ${guide.nativeCurrency.decimals} decimals`}
      />
    </Overlay>
  );
}
