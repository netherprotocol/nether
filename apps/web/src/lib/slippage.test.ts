import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SLIPPAGE_BPS, minOutFromQuote, percentToBps, spendableEth, MIN_GAS_RESERVE_WEI } from './slippage.ts';
import { WAD } from './format.ts';

describe('minOutFromQuote', () => {
  it('floors 0.5% of 1e18', () => {
    assert.equal(DEFAULT_SLIPPAGE_BPS, 50);
    assert.equal(minOutFromQuote(WAD, 50), (WAD * 9950n) / 10_000n);
  });

  it('returns 0 for a zero quote', () => {
    assert.equal(minOutFromQuote(0n, 50), 0n);
  });

  it('returns 0 at 100% slippage', () => {
    assert.equal(minOutFromQuote(WAD, 10_000), 0n);
    assert.equal(minOutFromQuote(WAD, percentToBps(100)), 0n);
  });
});

describe('spendableEth', () => {
  it('leaves a gas reserve when the balance is above the reserve', () => {
    const balance = WAD;
    assert.equal(spendableEth(balance, 0n), balance - MIN_GAS_RESERVE_WEI);
    const highGas = 3n * MIN_GAS_RESERVE_WEI;
    assert.equal(spendableEth(balance, highGas), balance - highGas);
  });

  it('fills the full balance when it is at or below the reserve', () => {
    assert.equal(spendableEth(MIN_GAS_RESERVE_WEI, 0n), MIN_GAS_RESERVE_WEI);
    assert.equal(spendableEth(MIN_GAS_RESERVE_WEI / 2n, 0n), MIN_GAS_RESERVE_WEI / 2n);
  });
});
