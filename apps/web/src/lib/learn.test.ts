import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIT_REPORTS,
  CONTRACT_LABELS,
  ERA_TABLE,
  GROSS_NETH_PER_ERA,
  HAS_PROTOCOL_PRESALE,
  OFFICIAL_MARKETS,
  contractDirectory,
  formatLearnNumber,
  hasIndependentProductionAudit,
} from './learn.ts';

describe('era table', () => {
  it('starts era 0 at 10 ETH and 1,000,000 NETH per ETH', () => {
    assert.equal(ERA_TABLE[0]?.era, 0);
    assert.equal(ERA_TABLE[0]?.ethCapacity, 10);
    assert.equal(ERA_TABLE[0]?.nethPerEth, 1_000_000);
  });

  it('issues 10,000,000 gross NETH per completed era', () => {
    for (const row of ERA_TABLE) {
      assert.equal(row.ethCapacity * row.nethPerEth, GROSS_NETH_PER_ERA);
      assert.equal(row.grossNeth, GROSS_NETH_PER_ERA);
    }
  });

  it('doubles ETH capacity and halves NETH per ETH each era', () => {
    for (let index = 1; index < ERA_TABLE.length; index += 1) {
      const previous = ERA_TABLE[index - 1];
      const current = ERA_TABLE[index];
      assert.ok(previous);
      assert.ok(current);
      assert.equal(current.ethCapacity, previous.ethCapacity * 2);
      assert.equal(current.nethPerEth, previous.nethPerEth / 2);
    }
  });
});

describe('live project facts', () => {
  it('does not claim a completed independent production audit', () => {
    assert.equal(AUDIT_REPORTS.length, 0);
    assert.equal(hasIndependentProductionAudit(), false);
  });

  it('does not list an official NETH market', () => {
    assert.equal(OFFICIAL_MARKETS.length, 0);
  });

  it('does not claim a protocol presale', () => {
    assert.equal(HAS_PROTOCOL_PRESALE, false);
  });

  it('exposes Sepolia contracts and no Base mainnet deployment', () => {
    const directory = contractDirectory();
    const mainnet = directory.find((entry) => entry.network.id === 'base');
    const sepolia = directory.find((entry) => entry.network.id === 'base-sepolia');
    assert.equal(mainnet?.network.enabled, false);
    assert.equal(mainnet?.contracts, undefined);
    assert.ok(sepolia?.contracts);
    assert.equal(CONTRACT_LABELS.length, 4);
  });

  it('formats era table figures with grouping separators', () => {
    assert.equal(formatLearnNumber(1_000_000), '1,000,000');
    assert.equal(formatLearnNumber(62_500), '62,500');
  });
});
