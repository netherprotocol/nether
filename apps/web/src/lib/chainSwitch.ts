import {
  addEthereumChainParams,
  hexChainId,
  type AddEthereumChainParams,
  type NetworkConfig,
} from './networks.ts';
import { nethWatchAssetParams, type WatchAssetParams } from './token.ts';

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

export type SwitchOutcome =
  | { kind: 'matched' }
  | { kind: 'switched' }
  | { kind: 'added' }
  | { kind: 'rejected' }
  | { kind: 'guide'; reason: string };

export type WatchAssetOutcome = 'watched' | 'guide';

export function providerErrorCode(error: unknown): number | undefined {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ('code' in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === 'number') {
        return code;
      }
      if (typeof code === 'string' && /^-?\d+$/.test(code)) {
        return Number(code);
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isUserRejected(error: unknown): boolean {
  if (providerErrorCode(error) === 4001) {
    return true;
  }
  if (error && typeof error === 'object' && 'name' in error) {
    const name = String((error as { name?: unknown }).name);
    if (name === 'UserRejectedRequestError') {
      return true;
    }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('user rejected') || message.includes('user denied');
}

function isMissingMethod(error: unknown): boolean {
  const code = providerErrorCode(error);
  if (code === 4100 || code === 4200) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('not available') ||
    message.includes('unsupported method') ||
    message.includes('method not found') ||
    message.includes('unrecognized method')
  );
}

function isUnrecognizedChain(error: unknown): boolean {
  if (providerErrorCode(error) === 4902) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('unrecognized chain') ||
    message.includes('not added') ||
    message.includes('try adding the chain')
  );
}

export async function readProviderChainId(provider: Eip1193Provider): Promise<number | undefined> {
  try {
    const raw = await provider.request({ method: 'eth_chainId' });
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint') {
      return Number(raw);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function switchOrAddChain(
  provider: Eip1193Provider | undefined,
  network: NetworkConfig,
  addParams: AddEthereumChainParams = addEthereumChainParams(network),
): Promise<SwitchOutcome> {
  if (!provider || typeof provider.request !== 'function') {
    return { kind: 'guide', reason: 'missing provider method' };
  }

  const current = await readProviderChainId(provider);
  if (current === network.chainId) {
    return { kind: 'matched' };
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId(network.chainId) }],
    });
    return { kind: 'switched' };
  } catch (error) {
    if (isUserRejected(error)) {
      return { kind: 'rejected' };
    }
    if (isMissingMethod(error)) {
      return { kind: 'guide', reason: 'method unavailable' };
    }
    if (!isUnrecognizedChain(error)) {
      return { kind: 'guide', reason: 'switch failed' };
    }
  }

  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [addParams],
    });
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId(network.chainId) }],
      });
    } catch (switchError) {
      if (isUserRejected(switchError)) {
        return { kind: 'rejected' };
      }
    }
    return { kind: 'added' };
  } catch (error) {
    if (isUserRejected(error)) {
      return { kind: 'rejected' };
    }
    if (isMissingMethod(error)) {
      return { kind: 'guide', reason: 'method unavailable' };
    }
    return { kind: 'guide', reason: 'add chain failed' };
  }
}

export async function watchAsset(
  provider: Eip1193Provider | undefined,
  params: WatchAssetParams,
): Promise<WatchAssetOutcome> {
  if (!provider || typeof provider.request !== 'function') {
    return 'guide';
  }
  try {
    const result = await provider.request({
      method: 'wallet_watchAsset',
      params,
    });
    if (result === true) {
      return 'watched';
    }
    return 'guide';
  } catch {
    return 'guide';
  }
}

export async function watchNethToken(
  provider: Eip1193Provider | undefined,
  address: `0x${string}`,
): Promise<WatchAssetOutcome> {
  return watchAsset(provider, nethWatchAssetParams(address));
}
