import { zeroAddress } from 'viem';
import type { Snapshot } from './snapshot.js';

export type Alert = {
  level: 'alert' | 'notice' | 'warn';
  message: string;
};

export const BALANCE_WARNING_MULTIPLE = 10n;

export function alertsFor(
  snapshot: Snapshot,
  previous: Snapshot | undefined,
  lastFeeWei: bigint,
): Alert[] {
  const alerts: Alert[] = [];

  if (snapshot.navViewFailed || snapshot.harvestViewFailed) {
    alerts.push({
      level: 'alert',
      message: 'Grave NAV/harvestable view reverted; skip harvest (broken adapter / migrate)',
    });
  }

  if (!snapshot.navViewFailed && snapshot.currentNAV < snapshot.protectedPrincipal) {
    alerts.push({
      level: 'alert',
      message: `currentNAV ${snapshot.currentNAV} < protectedPrincipal ${snapshot.protectedPrincipal}`,
    });
  }

  if (snapshot.pendingAdapter !== zeroAddress) {
    alerts.push({
      level: 'notice',
      message: `pendingStrategy ${snapshot.pendingAdapter} executeAfter=${snapshot.pendingExecuteAfter}`,
    });
  }

  if (previous && previous.activeStrategy.toLowerCase() !== snapshot.activeStrategy.toLowerCase()) {
    alerts.push({
      level: 'notice',
      message: `activeStrategy changed ${previous.activeStrategy} -> ${snapshot.activeStrategy}`,
    });
  }

  if (lastFeeWei > 0n && snapshot.operatorBalance < lastFeeWei * BALANCE_WARNING_MULTIPLE) {
    alerts.push({
      level: 'warn',
      message: `operator balance ${snapshot.operatorBalance} below 10× last fee ${lastFeeWei}`,
    });
  }

  return alerts;
}

export function emitAlerts(
  alerts: Alert[],
  write: (line: string) => void = (line) => console.error(line),
): void {
  for (const alert of alerts) {
    write(`${alert.level} ${alert.message}`);
  }
}
