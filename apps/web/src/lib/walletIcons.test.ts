import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FEATURED_ICON_FILES, featuredWalletIcon } from './walletIcons.ts';
import { SITE_BASE } from './site.ts';

describe('featured wallet icons', () => {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../public');

  it('serves MetaMask, Coinbase Wallet, and Trust Wallet marks from public/', () => {
    for (const file of Object.values(FEATURED_ICON_FILES)) {
      assert.equal(existsSync(join(publicDir, file)), true, file);
    }
    assert.equal(featuredWalletIcon('metamask'), `${SITE_BASE}wallets/metamask.svg`);
    assert.equal(featuredWalletIcon('coinbase'), `${SITE_BASE}wallets/coinbase.svg`);
    assert.equal(featuredWalletIcon('trust'), `${SITE_BASE}wallets/trust.png`);
  });
});
