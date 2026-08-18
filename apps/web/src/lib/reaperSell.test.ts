import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  REAPER_ALLOWANCE_CONFIRMED,
  formatSellNeth,
  reaperSellStepCopy,
} from './reaperSell.ts';
import { WAD } from './format.ts';

describe('reaperSellStepCopy', () => {
  it('asks for an exact Reaper allowance before any sale', () => {
    const copy = reaperSellStepCopy(true, 50n * WAD, false);
    assert.equal(formatSellNeth(50n * WAD), '50 $NETH');
    assert.equal(copy.button, 'Allow Reaper to use $NETH');
    assert.match(copy.stepOne, /Allow the Reaper to use 50 \$NETH from your account/);
    assert.match(copy.stepOne, /This is not the sale/);
    assert.match(copy.stepTwo, /you can sell 50 \$NETH/);
  });

  it('tells the seller to confirm the sale after allowance', () => {
    const copy = reaperSellStepCopy(false, 12_500n * 10n ** 14n, true);
    assert.equal(copy.button, 'Sell NETH');
    assert.match(copy.stepOne, /The Reaper can now use 1\.25 \$NETH from your account/);
    assert.match(copy.stepTwo, /Confirm Sell NETH to burn it and receive ETH/);
    assert.equal(REAPER_ALLOWANCE_CONFIRMED, 'Allowance confirmed. This did not sell.');
  });
});
