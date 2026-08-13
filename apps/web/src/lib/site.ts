export const SITE_TITLE = 'Nether';
export const SITE_DESCRIPTION =
  'Permanently capitalized monetary protocol on Base. Bury ETH in the Grave, mint NETH. Yield funds the Reaper, which buys and burns NETH.';
export const SITE_BASE = '/nether/';
export const HOLDER_KICKER = 'Bury ETH forever';
export const HOLDER_COPY =
  'Bury ETH forever. Mint $NETH. When the Grave earns, the Reaper buys and burns — no redemption, no peg, no promises.';
export const PRIMARY_CTA = 'Enter the void.';
export const SECONDARY_CTA = 'Documentation';
export const APP_LATER_TITLE = 'The app ships in a later W7 NIP';

export const FEATURES = [
  {
    icon: 'grave',
    title: 'Burn mechanism',
    body: 'Yield funds a reverse Dutch auction. The Reaper buys $NETH and burns it.',
  },
  {
    icon: 'reaper',
    title: 'No redemption',
    body: 'There is no exit. Buried ETH cannot be redeemed.',
  },
  {
    icon: 'lock',
    title: 'No peg',
    body: '$NETH isn’t pegged to ETH or any other asset.',
  },
  {
    icon: 'silence',
    title: 'No promises',
    body: 'No yield to holders. No floor. No promised price.',
  },
] as const;

export const STATS = [
  { label: 'Supply', value: '10M $NETH / era' },
  { label: 'Network', value: 'Base' },
  { label: 'Liquidity', value: 'Not required' },
  { label: 'Address', value: 'Unpublished' },
] as const;

export function withBase(pathname = ''): string {
  const base = import.meta.env.BASE_URL || SITE_BASE;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return prefix;
  }
  return `${prefix}${trimmed}`;
}
