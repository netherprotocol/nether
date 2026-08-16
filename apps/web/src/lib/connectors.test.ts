import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  featuredKind,
  groupConnectors,
  OTHER_WALLET_LABEL,
  walletConnectProjectId,
} from './connectors.ts';

describe('connector grouping', () => {
  const connectors = [
    { id: 'io.metamask', name: 'MetaMask', type: 'injected' },
    { id: 'metaMaskSDK', name: 'MetaMask', type: 'metaMask' },
    { id: 'com.coinbase.wallet', name: 'Coinbase Wallet', type: 'injected' },
    { id: 'coinbaseWalletSDK', name: 'Coinbase Wallet', type: 'coinbaseWallet' },
    { id: 'com.trustwallet.app', name: 'Trust Wallet', type: 'injected' },
    { id: 'io.rabby', name: 'Rabby', type: 'injected' },
    { id: 'injected', name: 'Injected', type: 'injected' },
    { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' },
  ];

  it('features MetaMask, Coinbase Wallet, and Trust Wallet', () => {
    const grouped = groupConnectors(connectors, { walletConnectConfigured: true });
    assert.equal(grouped.featured.metamask?.type, 'metaMask');
    assert.equal(grouped.featured.coinbase?.type, 'coinbaseWallet');
    assert.equal(grouped.featured.trust?.id, 'com.trustwallet.app');
    assert.equal(featuredKind({ id: 'io.metamask', name: 'MetaMask' }), 'metamask');
    assert.equal(featuredKind({ id: 'com.coinbase.wallet', name: 'Coinbase Wallet' }), 'coinbase');
    assert.equal(featuredKind({ id: 'com.trustwallet.app', name: 'Trust Wallet' }), 'trust');
  });

  it('puts unknown EIP-6963 ids in Other and skips generic window.ethereum', () => {
    const grouped = groupConnectors(connectors, { walletConnectConfigured: true });
    assert.deepEqual(
      grouped.otherInjected.map((item) => item.id),
      ['io.rabby'],
    );
  });

  it('hides WalletConnect when the project ID is empty', () => {
    assert.equal(walletConnectProjectId(undefined), undefined);
    assert.equal(walletConnectProjectId(''), undefined);
    assert.equal(walletConnectProjectId('  '), undefined);
    assert.equal(walletConnectProjectId('abc'), 'abc');

    const hidden = groupConnectors(connectors, { walletConnectConfigured: false });
    assert.equal(hidden.walletConnect, undefined);

    const shown = groupConnectors(connectors, { walletConnectConfigured: true });
    assert.equal(shown.walletConnect?.id, 'walletConnect');
    assert.equal(OTHER_WALLET_LABEL, 'Other wallet');
  });
});
