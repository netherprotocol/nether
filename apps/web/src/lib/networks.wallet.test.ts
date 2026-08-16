import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addEthereumChainParams,
  hexChainId,
  manualNetworkGuide,
  NETWORKS,
} from './networks.ts';

describe('add-chain payloads', () => {
  it('uses Base Sepolia official RPC, explorer, and 0x14a34', () => {
    const params = addEthereumChainParams(NETWORKS['base-sepolia']);
    assert.equal(params.chainId, '0x14a34');
    assert.equal(hexChainId(84532), '0x14a34');
    assert.equal(params.chainName, 'Base Sepolia');
    assert.deepEqual(params.rpcUrls, ['https://sepolia.base.org']);
    assert.deepEqual(params.blockExplorerUrls, ['https://sepolia.basescan.org']);
    assert.equal(params.nativeCurrency.decimals, 18);
    assert.equal(params.nativeCurrency.symbol, 'ETH');
  });

  it('uses Base Mainnet official RPC, explorer, and 0x2105', () => {
    const params = addEthereumChainParams(NETWORKS.base);
    assert.equal(params.chainId, '0x2105');
    assert.equal(hexChainId(8453), '0x2105');
    assert.equal(params.chainName, 'Base Mainnet');
    assert.deepEqual(params.rpcUrls, ['https://mainnet.base.org']);
    assert.deepEqual(params.blockExplorerUrls, ['https://basescan.org']);
    assert.equal(params.nativeCurrency.decimals, 18);
  });

  it('lists probed Sepolia backup RPCs in the manual guide', () => {
    const guide = manualNetworkGuide(NETWORKS['base-sepolia']);
    assert.equal(guide.officialRpcUrl, 'https://sepolia.base.org');
    assert.deepEqual(guide.backupRpcUrls, [
      'https://base-sepolia-rpc.publicnode.com',
      'https://base-sepolia.drpc.org',
      'https://base-sepolia.gateway.tenderly.co',
      'https://84532.rpc.thirdweb.com',
    ]);
    assert.equal(guide.chainId, 84532);
    assert.equal(guide.chainIdHex, '0x14a34');
  });
});
