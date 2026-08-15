import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ExecutionRevertedError,
  RpcUnavailableError,
  StickyRpcPool,
  isRpcUnavailable,
  memoryStore,
  rootErrorMessage,
  type FetchLike,
} from './rpcPool.ts';

const URL_A = 'https://rpc-a.example';
const URL_B = 'https://rpc-b.example';
const URL_C = 'https://rpc-c.example';
const CHAIN = 84532;

type Handler = (method: string) => { status?: number; json?: unknown } | 'network' | 'timeout';

function fetchStub(handlers: Record<string, Handler>): FetchLike {
  return async (url, init) => {
    const handler = handlers[url];
    if (!handler) {
      throw new Error(`unexpected url ${url}`);
    }
    const payload = JSON.parse(String(init?.body)) as { method: string };
    const spec = handler(payload.method);
    if (spec === 'network') {
      throw new TypeError('Failed to fetch');
    }
    if (spec === 'timeout') {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    }
    return new Response(JSON.stringify(spec.json ?? { jsonrpc: '2.0', id: 1, result: '0x14a34' }), {
      status: spec.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function ok(result: unknown = '0x14a34'): { json: unknown } {
  return { json: { jsonrpc: '2.0', id: 1, result } };
}

function rpcError(message: string, code = -32000): { json: unknown } {
  return { json: { jsonrpc: '2.0', id: 1, error: { code, message } } };
}

function pool(fetchImpl: FetchLike, urls = [URL_A, URL_B, URL_C], store = memoryStore()) {
  return new StickyRpcPool(urls, CHAIN, 'Base Sepolia', store, 'nether.rpc.sticky.test', fetchImpl, 50);
}

describe('StickyRpcPool', () => {
  it('keeps the first successful URL sticky', async () => {
    const hits: string[] = [];
    const rpc = pool(
      fetchStub({
        [URL_A]: (method) => {
          hits.push(`A:${method}`);
          return ok(method === 'eth_chainId' ? '0x14a34' : '0x1');
        },
        [URL_B]: () => {
          hits.push('B');
          return ok();
        },
      }),
    );
    const first = await rpc.request('eth_blockNumber');
    const second = await rpc.request('eth_blockNumber');
    assert.equal(first, '0x1');
    assert.equal(second, '0x1');
    assert.equal(rpc.stickyIndex, 0);
    assert.equal(hits.includes('B'), false);
  });

  it('rotates to the next URL after a failure and sticks there', async () => {
    const rpc = pool(
      fetchStub({
        [URL_A]: () => ({ status: 500, json: { error: 'down' } }),
        [URL_B]: (method) => ok(method === 'eth_chainId' ? '0x14a34' : '0xabc'),
        [URL_C]: () => ok(),
      }),
    );
    const result = await rpc.request('eth_blockNumber');
    assert.equal(result, '0xabc');
    assert.equal(rpc.stickyIndex, 1);
    const again = await rpc.request('eth_blockNumber');
    assert.equal(again, '0xabc');
    assert.equal(rpc.stickyIndex, 1);
  });

  it('throws RpcUnavailableError when every URL fails', async () => {
    const rpc = pool(
      fetchStub({
        [URL_A]: () => 'network',
        [URL_B]: () => ({ status: 429, json: { error: 'rate' } }),
        [URL_C]: () => rpcError('server exploded'),
      }),
    );
    await assert.rejects(() => rpc.request('eth_blockNumber'), RpcUnavailableError);
  });

  it('treats a chain-id mismatch as a failure and continues the pool', async () => {
    const rpc = pool(
      fetchStub({
        [URL_A]: () => ok('0x1'),
        [URL_B]: (method) => ok(method === 'eth_chainId' ? '0x14a34' : '0x99'),
        [URL_C]: () => ok(),
      }),
    );
    const result = await rpc.request('eth_blockNumber');
    assert.equal(result, '0x99');
    assert.equal(rpc.stickyIndex, 1);
  });

  it('does not rotate on an execution revert', async () => {
    const rpc = pool(
      fetchStub({
        [URL_A]: (method) =>
          method === 'eth_chainId'
            ? ok('0x14a34')
            : { json: { jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } } },
        [URL_B]: () => {
          throw new Error('should not be called');
        },
      }),
    );
    await assert.rejects(() => rpc.request('eth_call', []), ExecutionRevertedError);
    assert.equal(rpc.stickyIndex, 0);
  });

  it('retries the sticky URL once before rotating when asked', async () => {
    let aCalls = 0;
    const rpc = pool(
      fetchStub({
        [URL_A]: (method) => {
          if (method === 'eth_chainId') {
            return ok('0x14a34');
          }
          aCalls += 1;
          if (aCalls < 2) {
            return 'network';
          }
          return ok('0x2');
        },
        [URL_B]: () => ok('0xb'),
      }),
    );
    const result = await rpc.request('eth_blockNumber', [], { retryStickyOnce: true });
    assert.equal(result, '0x2');
    assert.equal(rpc.stickyIndex, 0);
    assert.equal(aCalls, 2);
  });

  it('resetToStart returns the pool to index 0', async () => {
    const store = memoryStore({ 'nether.rpc.sticky.test': '2' });
    const rpc = pool(
      fetchStub({
        [URL_A]: (method) => ok(method === 'eth_chainId' ? '0x14a34' : '0xaa'),
        [URL_B]: () => ok(),
        [URL_C]: () => 'network',
      }),
      [URL_A, URL_B, URL_C],
      store,
    );
    assert.equal(rpc.stickyIndex, 2);
    rpc.resetToStart();
    assert.equal(rpc.stickyIndex, 0);
    const result = await rpc.request('eth_blockNumber');
    assert.equal(result, '0xaa');
  });
});

describe('isRpcUnavailable', () => {
  it('finds RpcUnavailableError under a wrapped cause', () => {
    const inner = new RpcUnavailableError('Base Sepolia');
    const wrapped = new Error('Unknown RPC error', { cause: inner });
    assert.equal(isRpcUnavailable(inner), true);
    assert.equal(isRpcUnavailable(wrapped), true);
    assert.equal(isRpcUnavailable(new Error('nope')), false);
    assert.equal(rootErrorMessage(wrapped, 'fallback'), inner.message);
  });
});
