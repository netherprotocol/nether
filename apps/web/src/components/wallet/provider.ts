import type { Address } from 'viem';
import {
  addEthereumChainParams,
  type NetworkConfig,
} from '../../lib/networks.ts';
import {
  isUserRejected,
  switchOrAddChain,
  watchNethToken,
  type Eip1193Provider,
  type SwitchOutcome,
  type WatchAssetOutcome,
} from '../../lib/chainSwitch.ts';

export async function eip1193From(
  connector: { getProvider: (parameters?: { chainId?: number }) => Promise<unknown> } | undefined,
): Promise<Eip1193Provider | undefined> {
  if (!connector) {
    return undefined;
  }
  try {
    const provider = await connector.getProvider();
    if (provider && typeof provider === 'object' && 'request' in provider) {
      const request = (provider as { request?: unknown }).request;
      if (typeof request === 'function') {
        return provider as Eip1193Provider;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function addChainExplicit(
  provider: Eip1193Provider | undefined,
  network: NetworkConfig,
): Promise<SwitchOutcome> {
  if (!provider) {
    return { kind: 'guide', reason: 'missing provider method' };
  }
  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [addEthereumChainParams(network)],
    });
    return switchOrAddChain(provider, network);
  } catch (error) {
    if (isUserRejected(error)) {
      return { kind: 'rejected' };
    }
    return { kind: 'guide', reason: 'add chain failed' };
  }
}

export async function addNethToken(
  provider: Eip1193Provider | undefined,
  address: Address,
): Promise<WatchAssetOutcome> {
  return watchNethToken(provider, address);
}
