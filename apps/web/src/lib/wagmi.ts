import { QueryClient } from '@tanstack/react-query';
import { http, createConfig, type CreateConnectorFn } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, metaMask, walletConnect } from 'wagmi/connectors';
import { walletConnectProjectId } from './connectors.ts';
import { nethMarkUrl } from './nethMark.ts';

function envString(key: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const value = env?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function pagesOrigin(): string {
  const originRaw = envString('SITE') ?? 'https://rastsislaux.github.io';
  const origin = originRaw.endsWith('/') ? originRaw : `${originRaw}/`;
  const baseRaw = envString('BASE_URL') ?? '/nether/';
  const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
  return new URL(base, origin).href;
}

export function appOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.endsWith('/')
      ? window.location.origin
      : `${window.location.origin}/`;
    const baseRaw = envString('BASE_URL') ?? '/nether/';
    const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
    return new URL(base, origin).href;
  }
  return pagesOrigin();
}

export function readWalletConnectProjectId(): string | undefined {
  return walletConnectProjectId(envString('PUBLIC_WALLETCONNECT_PROJECT_ID'));
}

function metadata() {
  return {
    name: 'Nether',
    description: 'Permanently capitalized monetary protocol on Base.',
    url: appOrigin(),
    icons: [nethMarkUrl()],
  };
}

export function createNetherWagmiConfig(projectId: string | undefined = readWalletConnectProjectId()) {
  const connectors: CreateConnectorFn[] = [
    injected({ shimDisconnect: true }),
    metaMask({
      dappMetadata: {
        name: 'Nether',
        url: metadata().url,
        iconUrl: nethMarkUrl(),
      },
    }),
    coinbaseWallet({
      appName: 'Nether',
      appLogoUrl: nethMarkUrl(),
      preference: 'all',
    }),
  ];
  if (projectId) {
    connectors.push(
      walletConnect({
        projectId,
        metadata: metadata(),
        showQrModal: true,
      }),
    );
  }
  return createConfig({
    chains: [baseSepolia, base],
    connectors,
    multiInjectedProviderDiscovery: true,
    ssr: false,
    transports: {
      [baseSepolia.id]: http('https://sepolia.base.org'),
      [base.id]: http('https://mainnet.base.org'),
    },
  });
}

let queryClient: QueryClient | undefined;
let wagmiConfig: ReturnType<typeof createNetherWagmiConfig> | undefined;

export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          retry: 0,
        },
      },
    });
  }
  return queryClient;
}

export function getWagmiConfig(): ReturnType<typeof createNetherWagmiConfig> {
  if (!wagmiConfig) {
    wagmiConfig = createNetherWagmiConfig(readWalletConnectProjectId());
  }
  return wagmiConfig;
}

export function isWalletConnectConfigured(): boolean {
  return Boolean(readWalletConnectProjectId());
}
