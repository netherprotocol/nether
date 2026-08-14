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

export const GITHUB_REPO_FALLBACK = 'https://github.com/rastsislaux/nether';
export const GITHUB_REPO_URL = githubRepoUrl();

export const RISK_WARNING =
  'Capital at high risk, team does not hold any responsibility for possible losses. Hover for details.';
export const RISK_WARNING_DETAILS = [
  'Nether is not an investment product. Profit is not guaranteed, and you may lose some or all of your capital. $NETH is not backed or redeemable 1:1 for ETH; its value relies solely on Nether’s economic feedback loop, which may fail to maintain a stable DEX/Reaper rate.',
  'The protocol and smart contracts are provided “as is,” without warranties or guarantees. The team holds no responsibility for any loss of capital, damages, or other consequences arising from use of the protocol, including bugs, exploits, smart-contract attacks, oracle or third-party failures, network outages or congestion, market conditions, economic-model failures, or other technical or external events.',
  'Capital is at high risk. Use Nether entirely at your own risk.',
] as const;

function githubRepoUrl(): string {
  const fromEnv = import.meta.env.PUBLIC_GITHUB_REPO;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  return GITHUB_REPO_FALLBACK;
}

export function withBase(pathname = ''): string {
  const base = import.meta.env.BASE_URL || SITE_BASE;
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return prefix;
  }
  return `${prefix}${trimmed}`;
}
