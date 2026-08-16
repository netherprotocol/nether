export const BPS_DENOMINATOR = 10_000n;
export const DEFAULT_SLIPPAGE_BPS = 50;
export const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;
export const MIN_GAS_RESERVE_WEI = 10n ** 14n;

export function minOutFromQuote(quoted: bigint, slippageBps: number): bigint {
  if (quoted <= 0n) {
    return 0n;
  }
  if (!Number.isFinite(slippageBps) || slippageBps <= 0) {
    return quoted;
  }
  if (slippageBps >= 10_000) {
    return 0n;
  }
  const bps = BigInt(Math.round(slippageBps));
  return (quoted * (BPS_DENOMINATOR - bps)) / BPS_DENOMINATOR;
}

export function percentToBps(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) {
    return 0;
  }
  if (percent >= 100) {
    return 10_000;
  }
  return Math.round(percent * 100);
}

export function spendableEth(balance: bigint, estimatedGasCost: bigint): bigint {
  const reserve = estimatedGasCost > MIN_GAS_RESERVE_WEI ? estimatedGasCost : MIN_GAS_RESERVE_WEI;
  if (balance > reserve) {
    return balance - reserve;
  }
  return balance;
}
