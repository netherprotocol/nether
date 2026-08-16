import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  eraProgressPercent,
  eraRemaining,
  formatDuration,
  formatEth,
  formatEthPerNeth,
  formatNeth,
  formatNethPerEth,
  formatWei,
  formatAmountInput,
  parseAmount,
  splitBury,
  truncateAddress,
  WAD,
} from './format.ts';

describe('formatWei', () => {
  it('groups thousands and trims trailing zeros', () => {
    assert.equal(formatWei(12_438_72n * 10n ** 16n), '12,438.72');
    assert.equal(formatWei(1_000_000n * WAD), '1,000,000');
    assert.equal(formatWei(0n), '0');
  });
});

describe('token labels', () => {
  it('appends ETH and NETH', () => {
    assert.equal(formatEth(WAD), '1 ETH');
    assert.equal(formatNeth(964n * 10n ** 15n), '0.964 NETH');
  });
});

describe('truncateAddress', () => {
  it('keeps 4 hex characters on each side of the ellipsis', () => {
    assert.equal(
      truncateAddress('0xA12f000000000000000000000000000000009b3C'),
      '0xA12f...9b3C',
    );
  });
});

describe('formatDuration', () => {
  it('renders day hour minute parts', () => {
    assert.equal(formatDuration(2n * 86400n + 14n * 3600n + 21n * 60n), '2d 14h 21m');
    assert.equal(formatDuration(0n), '0s');
    assert.equal(formatDuration(90n), '1m');
  });
});

describe('era remaining', () => {
  it('computes leftover capacity and percent', () => {
    const capacity = 10n * WAD;
    const buried = 72n * 10n ** 17n;
    assert.equal(eraRemaining(buried, capacity), 28n * 10n ** 17n);
    assert.equal(eraProgressPercent(buried, capacity), 72);
    assert.equal(eraRemaining(capacity, capacity), 0n);
    assert.equal(eraProgressPercent(0n, 0n), 0);
  });
});

describe('rate labels', () => {
  it('formats bury and reaper directions', () => {
    assert.equal(formatNethPerEth(1_000_000n * WAD), '1 ETH → 1,000,000 NETH');
    assert.equal(formatEthPerNeth(0n), '—');
  });
});

describe('parseAmount', () => {
  it('parses decimal ether strings', () => {
    assert.equal(parseAmount('1'), WAD);
    assert.equal(parseAmount('1.5'), WAD + WAD / 2n);
    assert.equal(parseAmount(''), 0n);
    assert.equal(parseAmount('nope'), null);
  });
});

describe('formatAmountInput', () => {
  it('writes a decimal string without grouping commas', () => {
    assert.equal(formatAmountInput(WAD), '1');
    assert.equal(formatAmountInput(WAD + WAD / 2n), '1.5');
    assert.equal(formatAmountInput(0n), '0');
  });
});

describe('splitBury', () => {
  it('splits a bury that fills the current era', () => {
    const segments = splitBury(0n, 9n * WAD, 3n * WAD);
    assert.equal(segments.length, 2);
    assert.equal(segments[0]?.era, 0n);
    assert.equal(segments[0]?.eth, WAD);
    assert.equal(segments[0]?.neth, 1_000_000n * WAD);
    assert.equal(segments[1]?.era, 1n);
    assert.equal(segments[1]?.eth, 2n * WAD);
    assert.equal(segments[1]?.neth, 1_000_000n * WAD);
  });
});
