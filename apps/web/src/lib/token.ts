import type { Address } from 'viem';
import { nethMarkUrl } from './nethMark.ts';
import { explorerAddressUrl, type NetworkConfig } from './networks.ts';

export const NETH_TOKEN = {
  name: 'Nether',
  symbol: 'NETH',
  decimals: 18,
} as const;

export type WatchAssetParams = {
  type: 'ERC20';
  options: {
    address: Address;
    symbol: 'NETH';
    decimals: 18;
    image: string;
  };
};

export function nethWatchAssetParams(address: Address): WatchAssetParams {
  return {
    type: 'ERC20',
    options: {
      address,
      symbol: NETH_TOKEN.symbol,
      decimals: NETH_TOKEN.decimals,
      image: nethMarkUrl(),
    },
  };
}

export type NethManualGuide = {
  networkName: string;
  chainId: number;
  address: Address;
  explorerUrl: string;
  symbol: 'NETH';
  decimals: 18;
  generic: string;
  metamask: string;
  coinbase: string;
  trust: string;
};

export function nethManualGuide(network: NetworkConfig, address: Address): NethManualGuide {
  return {
    networkName: network.name,
    chainId: network.chainId,
    address,
    explorerUrl: explorerAddressUrl(network, address),
    symbol: NETH_TOKEN.symbol,
    decimals: NETH_TOKEN.decimals,
    generic:
      'Open the selected network, import a custom token, paste the contract, then confirm symbol and decimals.',
    metamask: 'Import tokens → Custom token',
    coinbase: 'The asset list may already show balances; if not, Import token.',
    trust:
      'Selected Base / Base Sepolia network → Manage crypto → Add custom token → Ethereum-compatible / Base',
  };
}
