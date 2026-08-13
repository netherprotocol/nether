export const SITE_TITLE = 'Nether';
export const SITE_DESCRIPTION =
  'Permanently capitalized monetary protocol on Base. Bury ETH in the Grave, mint NETH. Yield funds the Reaper, which buys and burns NETH.';
export const SITE_BASE = '/nether/';
export const HOLDER_COPY =
  'Bury ETH forever. Mint $NETH. When the Grave earns, the Reaper buys and burns — no redemption, no peg, no promises.';

export function withBase(pathname = ''): string {
  const base = import.meta.env.BASE_URL || SITE_BASE;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return prefix;
  }
  return `${prefix}${trimmed}`;
}
