import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { getQueryClient, getWagmiConfig } from '../../lib/wagmi.ts';

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={getWagmiConfig()} reconnectOnMount>
      <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
