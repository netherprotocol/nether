import type { Address } from 'viem';

export type WalletPrefStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function addedChainKey(chainId: number): string {
  return `nether.addedChain.${chainId}`;
}

export function addedNethKey(chainId: number, address: Address | string): string {
  return `nether.addedNeth.${chainId}.${address.toLowerCase()}`;
}

function defaultStore(): WalletPrefStore | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function hasAddedChain(chainId: number, store: WalletPrefStore | undefined = defaultStore()): boolean {
  return store?.getItem(addedChainKey(chainId)) === '1';
}

export function markAddedChain(chainId: number, store: WalletPrefStore | undefined = defaultStore()): void {
  store?.setItem(addedChainKey(chainId), '1');
}

export function hasAddedNeth(
  chainId: number,
  address: Address | string,
  store: WalletPrefStore | undefined = defaultStore(),
): boolean {
  return store?.getItem(addedNethKey(chainId, address)) === '1';
}

export function markAddedNeth(
  chainId: number,
  address: Address | string,
  store: WalletPrefStore | undefined = defaultStore(),
): void {
  store?.setItem(addedNethKey(chainId, address), '1');
}

export function shouldOfferAddChain(
  onSiteChain: boolean,
  chainId: number,
  store: WalletPrefStore | undefined = defaultStore(),
): boolean {
  return !onSiteChain && !hasAddedChain(chainId, store);
}

export function shouldOfferAddNeth(
  chainId: number,
  address: Address | string | undefined,
  store: WalletPrefStore | undefined = defaultStore(),
): boolean {
  return Boolean(address) && !hasAddedNeth(chainId, address!, store);
}
