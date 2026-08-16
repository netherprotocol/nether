import { useMemo, useState } from 'react';
import { useConnect, useConnectors } from 'wagmi';
import {
  FEATURED_LABELS,
  groupConnectors,
  type FeaturedKind,
} from '../../lib/connectors.ts';
import { isWalletConnectConfigured } from '../../lib/wagmi.ts';
import { ConnectorIcon, Overlay } from './ui.tsx';

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const connectors = useConnectors();
  const { connect, isPending, error, variables } = useConnect({
    mutation: {
      onSuccess: () => onClose(),
    },
  });
  const [note, setNote] = useState<string | null>(null);
  const configured = isWalletConnectConfigured();
  const grouped = useMemo(
    () =>
      groupConnectors(
        connectors.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          icon: typeof item.icon === 'string' ? item.icon : undefined,
          rdns: item.rdns,
        })),
        { walletConnectConfigured: configured },
      ),
    [connectors, configured],
  );

  const pendingId =
    isPending && variables?.connector && typeof variables.connector === 'object' && 'id' in variables.connector
      ? String(variables.connector.id)
      : undefined;

  function connectId(id: string) {
    const connector = connectors.find((item) => item.id === id);
    if (!connector) {
      return;
    }
    setNote(null);
    connect({ connector });
  }

  function connectFeatured(kind: FeaturedKind) {
    const connector = grouped.featured[kind];
    if (connector) {
      connectId(connector.id);
      return;
    }
    if (kind === 'trust' && grouped.walletConnect) {
      connectId(grouped.walletConnect.id);
      return;
    }
    setNote(
      kind === 'trust'
        ? 'Trust Wallet was not found. Open this page in Trust, or enable WalletConnect.'
        : `${FEATURED_LABELS[kind]} was not found. Install the extension or open this page in its in-app browser.`,
    );
  }

  return (
    <Overlay title="Connect wallet" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">Recommended</p>
      <div className="grid grid-cols-3 gap-2">
        {(['metamask', 'coinbase', 'trust'] as const).map((kind) => {
          const connector = grouped.featured[kind];
          return (
            <button
              key={kind}
              type="button"
              disabled={isPending}
              onClick={() => connectFeatured(kind)}
              className="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2 py-3 text-center hover:border-accent/50 disabled:opacity-50"
            >
              <ConnectorIcon src={connector?.icon} label={FEATURED_LABELS[kind]} />
              <span className="text-[0.65rem] tracking-[0.06em] text-paper">
                {FEATURED_LABELS[kind]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 mb-3 text-sm text-muted">Other wallets</p>
      <div className="space-y-1">
        {grouped.otherInjected.map((connector) => (
          <button
            key={connector.id}
            type="button"
            disabled={isPending}
            onClick={() => connectId(connector.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-left hover:border-accent/50 disabled:opacity-50"
          >
            <ConnectorIcon src={connector.icon} label={connector.name} />
            <span className="text-sm text-white">{connector.name}</span>
            {pendingId === connector.id ? (
              <span className="ml-auto text-xs text-muted">Connecting…</span>
            ) : null}
          </button>
        ))}
        {grouped.walletConnect ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => connectId(grouped.walletConnect!.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-left hover:border-accent/50 disabled:opacity-50"
          >
            <ConnectorIcon src={grouped.walletConnect.icon} label="WalletConnect" />
            <span className="text-sm text-white">WalletConnect</span>
          </button>
        ) : (
          <p className="text-xs text-muted">Mobile WalletConnect is unconfigured.</p>
        )}
      </div>
      {note ? <p className="mt-3 text-sm text-paper">{note}</p> : null}
      {error && !isUserFacingReject(error) ? (
        <p className="mt-3 text-sm text-accent">{error.message.split('\n')[0]}</p>
      ) : null}
    </Overlay>
  );
}

function isUserFacingReject(error: Error): boolean {
  const message = error.message.toLowerCase();
  return message.includes('user rejected') || message.includes('user denied');
}
