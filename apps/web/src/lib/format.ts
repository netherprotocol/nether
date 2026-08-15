export const WAD = 10n ** 18n;
export const ONE_ETH = WAD;
export const INITIAL_ERA_CAPACITY = 10n * WAD;
export const INITIAL_REWARD_RATE = 1_000_000n * WAD;

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatWei(wei: bigint, maxFractionDigits = 4): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / WAD;
  const fraction = abs % WAD;
  const wholeText = groupThousands(whole.toString());
  if (fraction === 0n || maxFractionDigits === 0) {
    return `${negative ? '-' : ''}${wholeText}`;
  }
  const fractionText = fraction
    .toString()
    .padStart(18, '0')
    .slice(0, maxFractionDigits)
    .replace(/0+$/, '');
  if (!fractionText) {
    return `${negative ? '-' : ''}${wholeText}`;
  }
  return `${negative ? '-' : ''}${wholeText}.${fractionText}`;
}

export function formatEth(wei: bigint, maxFractionDigits = 4): string {
  return `${formatWei(wei, maxFractionDigits)} ETH`;
}

export function formatNeth(wei: bigint, maxFractionDigits = 4): string {
  return `${formatWei(wei, maxFractionDigits)} NETH`;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDuration(seconds: bigint): string {
  if (seconds <= 0n) {
    return '0s';
  }
  let remaining = seconds;
  const days = remaining / 86400n;
  remaining %= 86400n;
  const hours = remaining / 3600n;
  remaining %= 3600n;
  const minutes = remaining / 60n;
  const parts: string[] = [];
  if (days > 0n) {
    parts.push(`${days}d`);
  }
  if (hours > 0n) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0n || parts.length === 0) {
    parts.push(`${minutes}m`);
  }
  return parts.join(' ');
}

export function eraProgressPercent(buried: bigint, capacity: bigint): number {
  if (capacity <= 0n) {
    return 0;
  }
  const scaled = Number((buried * 10_000n) / capacity) / 100;
  return Math.min(100, Math.max(0, scaled));
}

export function eraRemaining(buried: bigint, capacity: bigint): bigint {
  return capacity > buried ? capacity - buried : 0n;
}

export function formatNethPerEth(nethOutForOneEth: bigint): string {
  return `1 ETH → ${formatWei(nethOutForOneEth, 6)} NETH`;
}

export function formatEthPerNeth(rateNethPerEth: bigint): string {
  if (rateNethPerEth === 0n) {
    return '—';
  }
  const ethOut = (WAD * WAD) / rateNethPerEth;
  return `1 NETH → ${formatWei(ethOut, 8)} ETH`;
}

export function parseAmount(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '.') {
    return 0n;
  }
  if (!/^\d+(\.\d*)?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const padded = (fraction + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole || '0') * WAD + BigInt(padded);
}

export type BurySegment = {
  era: bigint;
  eth: bigint;
  neth: bigint;
};

function log2(value: bigint): bigint {
  let result = 0n;
  let cursor = value;
  while (cursor > 1n) {
    cursor >>= 1n;
    result += 1n;
  }
  return result;
}

export function maxEra(): bigint {
  return log2(INITIAL_REWARD_RATE);
}

export function eraCapacity(era: bigint): bigint {
  return INITIAL_ERA_CAPACITY * 2n ** era;
}

export function nethForSegment(ethAmount: bigint, era: bigint): bigint {
  return (ethAmount * INITIAL_REWARD_RATE) / (WAD * 2n ** era);
}

export function splitBury(
  currentEra: bigint,
  currentEraBuried: bigint,
  ethAmount: bigint,
): BurySegment[] {
  if (ethAmount === 0n) {
    return [];
  }
  const segments: BurySegment[] = [];
  let era = currentEra;
  let buried = currentEraBuried;
  let remaining = ethAmount;
  const last = maxEra();
  while (remaining > 0n && era <= last) {
    const capacity = eraCapacity(era);
    const space = capacity - buried;
    if (space === 0n) {
      era += 1n;
      buried = 0n;
      continue;
    }
    const take = remaining < space ? remaining : space;
    segments.push({ era, eth: take, neth: nethForSegment(take, era) });
    remaining -= take;
    buried += take;
    if (buried === capacity) {
      era += 1n;
      buried = 0n;
    }
  }
  return segments;
}
