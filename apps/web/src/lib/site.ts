export const SITE_TITLE = 'Nether';
export const SITE_DESCRIPTION =
  'Permanently capitalized monetary protocol on Base. Bury ETH in the Grave, mint NETH. Yield funds the Reaper, which buys and burns NETH.';
export const SITE_BASE = '/nether/';
export const HOLDER_KICKER = 'Bury ETH forever';
export const HOLDER_COPY =
  'Bury ETH forever. Mint $NETH. When the Grave earns, the Reaper buys and burns — no redemption, no peg, no promises.';
export const PRIMARY_CTA = 'Enter the Grave';
export const SECONDARY_CTA = 'Documentation';
export const GRAVE_LOCKED_HINT =
  'The Grave has not been dug yet. Once it is, you’ll be able to look inside.';

export const FEATURES = [
  {
    icon: 'grave',
    title: 'The Grave',
    body: 'Bury ETH forever in The Grave. From what remains, rises $NETH.',
  },
  {
    icon: 'reckoning',
    title: 'Reckoning',
    body: 'Once the reckoning comes, the reward for burying is halved.',
  },
  {
    icon: 'reaper',
    title: 'The Reaper',
    body: 'What the Grave earns, Reaper spends to buy back $NETH, draining the supply.',
  },
  {
    icon: 'end',
    title: 'The End',
    body: 'It all ends when there’s no more ETH.',
  },
] as const;

export type Stat = {
  label: string;
  value: string;
  detail?: string;
};

export const STATS: readonly Stat[] = [
  { label: 'Grave size', value: '0 ETH' },
  { label: 'Supply', value: '0 $NETH', detail: '10M $NETH / era' },
  { label: 'Current burial rate', value: '1M $NETH / 1 ETH' },
  { label: 'Contract', value: 'Address Unknown Yet' },
];

export function withBase(pathname = ''): string {
  const base = import.meta.env.BASE_URL || SITE_BASE;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return prefix;
  }
  return `${prefix}${trimmed}`;
}
