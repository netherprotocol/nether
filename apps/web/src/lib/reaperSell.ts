import { formatWei } from './format.ts';

export const REAPER_ALLOWANCE_PENDING = 'Confirm allowance in wallet…';
export const REAPER_ALLOWANCE_CONFIRMED = 'Allowance confirmed. This did not sell.';
export const REAPER_SALE_PENDING = 'Confirm sale in wallet…';
export const REAPER_SALE_CONFIRMED = 'Sale confirmed';

export function formatSellNeth(amount: bigint): string {
  return `${formatWei(amount, 4)} $NETH`;
}

export function reaperSellStepCopy(needsApprove: boolean, amount: bigint, justApproved: boolean) {
  const neth = formatSellNeth(amount);
  if (needsApprove) {
    return {
      button: 'Allow Reaper to use $NETH',
      stepOne: `1. Allow the Reaper to use ${neth} from your account. This is not the sale.`,
      stepTwo: `2. After that, you can sell ${neth}.`,
    };
  }
  return {
    button: 'Sell NETH',
    stepOne: justApproved
      ? `1. The Reaper can now use ${neth} from your account.`
      : `1. The Reaper can use ${neth} from your account.`,
    stepTwo: `2. Confirm Sell NETH to burn it and receive ETH.`,
  };
}
