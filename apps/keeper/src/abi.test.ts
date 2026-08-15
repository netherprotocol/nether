import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { graveAbi, reaperAbi } from './abi.js';
import { HELP } from './index.js';

describe('abi fragments', () => {
  it('omits standalone collectSurplus, sellToReaper, bury, and admin writes', () => {
    const blob = JSON.stringify(graveAbi) + JSON.stringify(reaperAbi);
    for (const forbidden of [
      'collectSurplus',
      'sellToReaper',
      'bury',
      'scheduleStrategy',
      'executeStrategyMigration',
      'cancelScheduledStrategy',
      'setReaper',
      'depositETH',
      'withdrawETH',
    ]) {
      assert.equal(blob.includes(forbidden), false, forbidden);
    }
    assert.equal(blob.includes('harvest'), true);
    assert.equal(blob.includes('startAuction'), true);
    assert.equal(blob.includes('finalizeAuction'), true);
  });
});

describe('help', () => {
  it('says the keeper is permissionless, pays its own gas, and skips dust', () => {
    assert.match(HELP, /permissionless/i);
    assert.match(HELP, /pays its own gas/i);
    assert.match(HELP, /skips dust/i);
  });
});
