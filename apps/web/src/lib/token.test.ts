import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nethMarkUrl } from './nethMark.ts';
import { nethWatchAssetParams, nethManualGuide } from './token.ts';
import { NETWORKS } from './networks.ts';

const SEPOLIA_NETH = '0x8AC12cf1806391572D8Cb39B278F49dE317B9F73';

describe('wallet_watchAsset params', () => {
  it('uses the selected-network NETH address, symbol, decimals, and mark URL', () => {
    const params = nethWatchAssetParams(SEPOLIA_NETH);
    assert.equal(params.type, 'ERC20');
    assert.equal(params.options.address, SEPOLIA_NETH);
    assert.equal(params.options.symbol, 'NETH');
    assert.equal(params.options.decimals, 18);
    assert.equal(params.options.image, nethMarkUrl());
    assert.equal(params.options.image, 'https://netherprotocol.xyz/neth.svg');
  });

  it('names the selected network in the manual guide', () => {
    const guide = nethManualGuide(NETWORKS['base-sepolia'], SEPOLIA_NETH);
    assert.equal(guide.networkName, 'Base Sepolia');
    assert.equal(guide.chainId, 84532);
    assert.equal(guide.address, SEPOLIA_NETH);
    assert.equal(guide.symbol, 'NETH');
    assert.equal(guide.decimals, 18);
    assert.ok(guide.explorerUrl.includes('sepolia.basescan.org'));
  });
});
