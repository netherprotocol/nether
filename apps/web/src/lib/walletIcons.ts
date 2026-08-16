import type { FeaturedKind } from './connectors.ts';

export const FEATURED_ICON_FILES: Record<FeaturedKind, string> = {
  metamask: 'wallets/metamask.svg',
  coinbase: 'wallets/coinbase.svg',
  trust: 'wallets/trust.png',
};

const DEFAULT_BASE = '/nether/';

function siteBase(): string {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const baseRaw = typeof env?.BASE_URL === 'string' && env.BASE_URL.trim() ? env.BASE_URL : DEFAULT_BASE;
  return baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
}

export function featuredWalletIcon(kind: FeaturedKind): string {
  return `${siteBase()}${FEATURED_ICON_FILES[kind]}`;
}
