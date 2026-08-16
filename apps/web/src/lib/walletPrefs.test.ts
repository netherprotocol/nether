import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addedChainKey,
  addedNethKey,
  hasAddedChain,
  hasAddedNeth,
  markAddedChain,
  markAddedNeth,
  shouldOfferAddChain,
  shouldOfferAddNeth,
} from './walletPrefs.ts';

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe('wallet add-token / add-chain prefs', () => {
  const neth = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';

  it('keys are chain-scoped and lowercase the token address', () => {
    assert.equal(addedChainKey(84532), 'nether.addedChain.84532');
    assert.equal(
      addedNethKey(84532, neth),
      'nether.addedNeth.84532.0xabcdef0123456789abcdef0123456789abcdef01',
    );
  });

  it('hides add-chain once the wallet is on the site chain or the user already asked', () => {
    const store = memoryStore();
    assert.equal(shouldOfferAddChain(false, 84532, store), true);
    assert.equal(shouldOfferAddChain(true, 84532, store), false);

    markAddedChain(84532, store);
    assert.equal(hasAddedChain(84532, store), true);
    assert.equal(shouldOfferAddChain(false, 84532, store), false);
    assert.equal(hasAddedChain(8453, store), false);
  });

  it('hides add-$NETH after the user presses it on this origin', () => {
    const store = memoryStore();
    assert.equal(shouldOfferAddNeth(84532, neth, store), true);
    assert.equal(shouldOfferAddNeth(84532, undefined, store), false);

    markAddedNeth(84532, neth, store);
    assert.equal(hasAddedNeth(84532, neth.toLowerCase(), store), true);
    assert.equal(shouldOfferAddNeth(84532, neth, store), false);
    assert.equal(shouldOfferAddNeth(8453, neth, store), true);
  });
});
