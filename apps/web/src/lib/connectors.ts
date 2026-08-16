export type ConnectorLike = {
  id: string;
  name: string;
  type?: string;
  icon?: string | undefined;
  rdns?: string | readonly string[];
};

export type FeaturedKind = 'metamask' | 'coinbase' | 'trust';

export type GroupedConnectors<T extends ConnectorLike> = {
  featured: Record<FeaturedKind, T | undefined>;
  otherInjected: T[];
  walletConnect: T | undefined;
};

export function walletConnectProjectId(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

export function isWalletConnectConnector(connector: ConnectorLike): boolean {
  const id = connector.id.toLowerCase();
  const type = (connector.type ?? '').toLowerCase();
  const name = normalize(connector.name);
  return type === 'walletconnect' || id === 'walletconnect' || name.includes('walletconnect');
}

export function isGenericInjected(connector: ConnectorLike): boolean {
  return connector.id === 'injected' && (connector.type === 'injected' || connector.type === undefined);
}

export function featuredKind(connector: ConnectorLike): FeaturedKind | null {
  if (isWalletConnectConnector(connector)) {
    return null;
  }
  const id = connector.id.toLowerCase();
  const rdnsRaw = connector.rdns;
  const rdnsList = Array.isArray(rdnsRaw) ? rdnsRaw : rdnsRaw ? [rdnsRaw] : [];
  const rdns = rdnsList.map((item) => item.toLowerCase());
  const type = (connector.type ?? '').toLowerCase();
  const name = normalize(connector.name);

  if (
    id === 'io.metamask' ||
    id === 'io.metamask.flask' ||
    id === 'metamask' ||
    id === 'metamasksdk' ||
    rdns.includes('io.metamask') ||
    rdns.includes('io.metamask.flask') ||
    type === 'metamask' ||
    name === 'metamask'
  ) {
    return 'metamask';
  }

  if (
    id === 'com.coinbase.wallet' ||
    id.includes('coinbase') ||
    rdns.includes('com.coinbase.wallet') ||
    type === 'coinbasewallet' ||
    name.includes('coinbase')
  ) {
    return 'coinbase';
  }

  if (
    id === 'com.trustwallet.app' ||
    id === 'trust' ||
    rdns.includes('com.trustwallet.app') ||
    name.includes('trustwallet') ||
    name === 'trust'
  ) {
    return 'trust';
  }

  return null;
}

function prefer(list: ConnectorLike[], type: string): ConnectorLike | undefined {
  return list.find((item) => (item.type ?? '').toLowerCase() === type) ?? list[0];
}

export function groupConnectors<T extends ConnectorLike>(
  connectors: readonly T[],
  options: { walletConnectConfigured: boolean },
): GroupedConnectors<T> {
  const featuredLists: Record<FeaturedKind, T[]> = {
    metamask: [],
    coinbase: [],
    trust: [],
  };
  const otherInjected: T[] = [];
  let walletConnect: T | undefined;

  for (const connector of connectors) {
    if (isWalletConnectConnector(connector)) {
      if (options.walletConnectConfigured) {
        walletConnect = connector;
      }
      continue;
    }
    if (isGenericInjected(connector)) {
      continue;
    }
    const kind = featuredKind(connector);
    if (kind) {
      featuredLists[kind].push(connector);
    } else {
      otherInjected.push(connector);
    }
  }

  return {
    featured: {
      metamask: prefer(featuredLists.metamask, 'metamask') as T | undefined,
      coinbase: prefer(featuredLists.coinbase, 'coinbasewallet') as T | undefined,
      trust: featuredLists.trust[0],
    },
    otherInjected,
    walletConnect: options.walletConnectConfigured ? walletConnect : undefined,
  };
}

export const FEATURED_LABELS: Record<FeaturedKind, string> = {
  metamask: 'MetaMask',
  coinbase: 'Coinbase Wallet',
  trust: 'Trust Wallet',
};
