import { Copy, ExternalLink, Plus, Unplug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDisconnect } from 'wagmi';
import { explorerAddressUrl, type NetworkConfig } from '../../lib/networks.ts';
import { truncateAddress } from '../../lib/format.ts';
import type { Address } from 'viem';

export function AccountMenu({
  address,
  network,
  showAddNetwork,
  showAddNeth,
  onAddNetwork,
  onAddNeth,
  onClose,
  placement = 'bottom',
}: {
  address: Address;
  network: NetworkConfig;
  showAddNetwork: boolean;
  showAddNeth: boolean;
  onAddNetwork: () => void;
  onAddNeth: () => void;
  onClose: () => void;
  placement?: 'bottom' | 'top';
}) {
  const { disconnect } = useDisconnect();
  const rootRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className={
        placement === 'top'
          ? 'absolute right-0 bottom-full z-40 mb-2 w-64 rounded-lg border border-white/10 bg-[#141414] py-1 shadow-xl'
          : 'absolute right-0 z-40 mt-2 w-64 rounded-lg border border-white/10 bg-[#141414] py-1 shadow-xl'
      }
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-paper hover:bg-white/5"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
        {copied ? 'Copied' : `Copy ${truncateAddress(address)}`}
      </button>
      <a
        role="menuitem"
        href={explorerAddressUrl(network, address)}
        rel="noopener noreferrer"
        target="_blank"
        className="flex items-center gap-2 px-3 py-2 text-sm text-paper hover:bg-white/5"
      >
        <ExternalLink className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
        View on explorer
      </a>
      {showAddNetwork ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-paper hover:bg-white/5"
          onClick={onAddNetwork}
        >
          <Plus className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
          Add {network.walletChainName}
        </button>
      ) : null}
      {showAddNeth ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-paper hover:bg-white/5"
          onClick={onAddNeth}
        >
          <Plus className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
          Add $NETH
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-paper hover:bg-white/5"
        onClick={() => {
          disconnect();
          onClose();
        }}
      >
        <Unplug className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
        Disconnect
      </button>
    </div>
  );
}
