import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  switchOrAddChain,
  watchAsset,
  type Eip1193Provider,
} from './chainSwitch.ts';
import { addEthereumChainParams, NETWORKS } from './networks.ts';
import { nethWatchAssetParams } from './token.ts';

type Handler = (params?: unknown) => unknown;

class StubProvider implements Eip1193Provider {
  chainId: string;
  handlers: Record<string, Handler>;
  calls: { method: string; params?: unknown }[] = [];

  constructor(chainId: string, handlers: Record<string, Handler> = {}) {
    this.chainId = chainId;
    this.handlers = {
      eth_chainId: () => this.chainId,
      ...handlers,
    };
  }

  async request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
    this.calls.push({ method, params });
    const handler = this.handlers[method];
    if (!handler) {
      const error = new Error(`${method} is not available`) as Error & { code: number };
      error.code = 4200;
      throw error;
    }
    return handler(params);
  }
}

function rpcError(code: number, message: string): Error & { code: number } {
  const error = new Error(message) as Error & { code: number };
  error.code = code;
  return error;
}

const sepolia = NETWORKS['base-sepolia'];
const addParams = addEthereumChainParams(sepolia);

describe('switchOrAddChain', () => {
  it('is a no-op when the wallet is already on the target chain', async () => {
    const provider = new StubProvider('0x14a34');
    const result = await switchOrAddChain(provider, sepolia, addParams);
    assert.equal(result.kind, 'matched');
    assert.equal(
      provider.calls.some((call) => call.method === 'wallet_switchEthereumChain'),
      false,
    );
  });

  it('adds the chain after 4902, then switches again', async () => {
    const provider = new StubProvider('0x1', {
      wallet_switchEthereumChain: () => {
        throw rpcError(4902, 'Unrecognized chain');
      },
      wallet_addEthereumChain: () => null,
    });
    const result = await switchOrAddChain(provider, sepolia, addParams);
    assert.equal(result.kind, 'added');
    assert.deepEqual(
      provider.calls.map((call) => call.method),
      ['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain'],
    );
    const addCall = provider.calls.find((call) => call.method === 'wallet_addEthereumChain');
    assert.deepEqual(addCall?.params, [addParams]);
  });

  it('selects the guide path when the method is missing (4100) or the provider has no request', async () => {
    const missing = new StubProvider('0x1', {
      wallet_switchEthereumChain: () => {
        throw rpcError(4100, 'Unauthorized');
      },
    });
    const missingResult = await switchOrAddChain(missing, sepolia, addParams);
    assert.equal(missingResult.kind, 'guide');
    if (missingResult.kind === 'guide') {
      assert.equal(missingResult.reason, 'method unavailable');
    }

    const none = await switchOrAddChain(undefined, sepolia, addParams);
    assert.equal(none.kind, 'guide');
    if (none.kind === 'guide') {
      assert.equal(none.reason, 'missing provider method');
    }
  });

  it('treats 4001 as user-reject', async () => {
    const provider = new StubProvider('0x1', {
      wallet_switchEthereumChain: () => {
        throw rpcError(4001, 'User rejected the request');
      },
    });
    const result = await switchOrAddChain(provider, sepolia, addParams);
    assert.equal(result.kind, 'rejected');
  });
});

describe('watchAsset', () => {
  it('returns watched only when the wallet replies true', async () => {
    const ok = new StubProvider('0x14a34', {
      wallet_watchAsset: () => true,
    });
    const params = nethWatchAssetParams('0x8AC12cf1806391572D8Cb39B278F49dE317B9F73');
    assert.equal(await watchAsset(ok, params), 'watched');

    const already = new StubProvider('0x14a34', {
      wallet_watchAsset: () => false,
    });
    assert.equal(await watchAsset(already, params), 'guide');

    const missing = new StubProvider('0x14a34');
    assert.equal(await watchAsset(missing, params), 'guide');
  });
});
