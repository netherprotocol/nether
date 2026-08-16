import { contractsFor, type DeploymentContracts } from './deployments.ts';

export type NetworkId = 'base' | 'base-sepolia';

export type NetworkConfig = {
  id: NetworkId;
  name: string;
  walletChainName: string;
  chainId: number;
  explorer: string;
  officialRpcUrl: string;
  enabled: boolean;
  rpcUrls: readonly string[];
  disabledReason?: string;
};

export const NATIVE_CURRENCY = {
  name: 'Ether',
  symbol: 'ETH',
  decimals: 18,
} as const;

export type AddEthereumChainParams = {
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: typeof NATIVE_CURRENCY;
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export const NETWORK_STORAGE_KEY = 'nether.network';
export const NETWORK_CHANGE_EVENT = 'nether:network-change';

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  base: {
    id: 'base',
    name: 'Base',
    walletChainName: 'Base Mainnet',
    chainId: 8453,
    explorer: 'https://basescan.org',
    officialRpcUrl: 'https://mainnet.base.org',
    enabled: false,
    rpcUrls: [],
    disabledReason: 'Mainnet deployment is not live.',
  },
  'base-sepolia': {
    id: 'base-sepolia',
    name: 'Base Sepolia',
    walletChainName: 'Base Sepolia',
    chainId: 84532,
    explorer: 'https://sepolia.basescan.org',
    officialRpcUrl: 'https://sepolia.base.org',
    enabled: true,
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com',
      'https://base-sepolia.drpc.org',
      'https://base-sepolia.gateway.tenderly.co',
      'https://84532.rpc.thirdweb.com',
    ],
  },
};

export const NETWORK_ORDER: readonly NetworkId[] = ['base', 'base-sepolia'];

export function firstEnabledNetworkId(): NetworkId {
  const enabled = NETWORK_ORDER.find((id) => NETWORKS[id].enabled);
  if (!enabled) {
    throw new Error('No enabled network');
  }
  return enabled;
}

export function resolveNetworkId(stored: string | null): NetworkId {
  if (stored === 'base' || stored === 'base-sepolia') {
    if (NETWORKS[stored].enabled) {
      return stored;
    }
  }
  return firstEnabledNetworkId();
}

export function explorerAddressUrl(network: NetworkConfig, address: string): string {
  return `${network.explorer}/address/${address}`;
}

export function explorerTxUrl(network: NetworkConfig, hash: string): string {
  return `${network.explorer}/tx/${hash}`;
}

export function hexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export function addEthereumChainParams(network: NetworkConfig): AddEthereumChainParams {
  return {
    chainId: hexChainId(network.chainId),
    chainName: network.walletChainName,
    nativeCurrency: { ...NATIVE_CURRENCY },
    rpcUrls: [network.officialRpcUrl],
    blockExplorerUrls: [network.explorer],
  };
}

export function manualNetworkGuide(network: NetworkConfig): {
  chainName: string;
  chainId: number;
  chainIdHex: `0x${string}`;
  officialRpcUrl: string;
  backupRpcUrls: readonly string[];
  explorer: string;
  nativeCurrency: typeof NATIVE_CURRENCY;
} {
  const backups = network.rpcUrls.filter((url) => url !== network.officialRpcUrl);
  return {
    chainName: network.walletChainName,
    chainId: network.chainId,
    chainIdHex: hexChainId(network.chainId),
    officialRpcUrl: network.officialRpcUrl,
    backupRpcUrls: backups,
    explorer: network.explorer,
    nativeCurrency: NATIVE_CURRENCY,
  };
}

export function contractsOn(network: NetworkConfig): DeploymentContracts | undefined {
  return contractsFor(network.chainId);
}

export function readStoredNetworkId(): NetworkId {
  if (typeof window === 'undefined') {
    return firstEnabledNetworkId();
  }
  return resolveNetworkId(window.localStorage.getItem(NETWORK_STORAGE_KEY));
}

export function persistNetworkId(id: NetworkId): void {
  if (!NETWORKS[id].enabled) {
    return;
  }
  window.localStorage.setItem(NETWORK_STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent<NetworkId>(NETWORK_CHANGE_EVENT, { detail: id }));
}

export function subscribeNetworkChange(onChange: (id: NetworkId) => void): () => void {
  const onCustom = (event: Event) => {
    const id = (event as CustomEvent<NetworkId>).detail;
    if (id === 'base' || id === 'base-sepolia') {
      onChange(resolveNetworkId(id));
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === NETWORK_STORAGE_KEY) {
      onChange(resolveNetworkId(event.newValue));
    }
  };
  window.addEventListener(NETWORK_CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(NETWORK_CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
