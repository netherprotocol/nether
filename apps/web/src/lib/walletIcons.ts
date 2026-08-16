import type { FeaturedKind } from './connectors.ts';
import { withBase } from './site.ts';

export const FEATURED_ICON_FILES: Record<FeaturedKind, string> = {
  metamask: 'wallets/metamask.svg',
  coinbase: 'wallets/coinbase.svg',
  trust: 'wallets/trust.png',
};

export function featuredWalletIcon(kind: FeaturedKind): string {
  return withBase(FEATURED_ICON_FILES[kind]);
}
