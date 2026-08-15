import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NETWORKS,
  explorerAddressUrl,
  firstEnabledNetworkId,
  resolveNetworkId,
} from './networks.ts';
import { contractsFor } from './deployments.ts';

describe('network config', () => {
  it('enables Base Sepolia and disables Base mainnet', () => {
    assert.equal(NETWORKS.base.enabled, false);
    assert.equal(NETWORKS['base-sepolia'].enabled, true);
    assert.equal(NETWORKS.base.chainId, 8453);
    assert.equal(NETWORKS['base-sepolia'].chainId, 84532);
    assert.equal(firstEnabledNetworkId(), 'base-sepolia');
  });

  it('ignores a stored disabled network', () => {
    assert.equal(resolveNetworkId(null), 'base-sepolia');
    assert.equal(resolveNetworkId('base'), 'base-sepolia');
    assert.equal(resolveNetworkId('base-sepolia'), 'base-sepolia');
    assert.equal(resolveNetworkId('other'), 'base-sepolia');
  });

  it('builds explorer URLs for the selected network', () => {
    const grave = '0x21B7B051C85dc071CdA072Ec71D7c1b85cDc4De6';
    assert.equal(
      explorerAddressUrl(NETWORKS['base-sepolia'], grave),
      'https://sepolia.basescan.org/address/0x21B7B051C85dc071CdA072Ec71D7c1b85cDc4De6',
    );
    assert.equal(
      explorerAddressUrl(NETWORKS.base, grave),
      'https://basescan.org/address/0x21B7B051C85dc071CdA072Ec71D7c1b85cDc4De6',
    );
  });

  it('loads Sepolia contracts from the deployment JSON', () => {
    const contracts = contractsFor(84532);
    assert.ok(contracts);
    assert.equal(contracts.grave, '0x21B7B051C85dc071CdA072Ec71D7c1b85cDc4De6');
    assert.equal(contracts.neth, '0x8AC12cf1806391572D8Cb39B278F49dE317B9F73');
    assert.equal(contracts.reaper, '0xEF26e160d6d93496dfdAD54b562C3C02dBD722c5');
    assert.equal(contracts.adapter, '0xc47606cF64Bf2B1Ab555CeE30e123Ba1a26eB0b5');
    assert.equal(contractsFor(8453), undefined);
  });
});
