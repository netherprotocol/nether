import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  NETWORKS,
  contractsOn,
  firstEnabledNetworkId,
  readStoredNetworkId,
  subscribeNetworkChange,
  type NetworkId,
} from '../lib/networks.ts';
import {
  createPoolClient,
  readSnapshot,
  type PoolClient,
  type ProtocolSnapshot,
} from '../lib/protocol.ts';
import {
  RPC_STICKY_PREFIX,
  StickyRpcPool,
  isRpcUnavailable,
  rootErrorMessage,
  sessionStickyStore,
} from '../lib/rpcPool.ts';
import { loadCachedSnapshot, saveCachedSnapshot } from '../lib/snapshotCache.ts';

export type LivePhase = 'loading' | 'ready' | 'rpc-down' | 'read-error';

const POLL_MS = 12_000;

export function useLiveSnapshot() {
  const [networkId, setNetworkId] = useState<NetworkId>(firstEnabledNetworkId);
  const [phase, setPhase] = useState<LivePhase>('loading');
  const [snapshot, setSnapshot] = useState<ProtocolSnapshot | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const network = NETWORKS[networkId];
  const contracts = useMemo(() => contractsOn(network), [network]);
  const poolRef = useRef<StickyRpcPool | null>(null);
  const clientRef = useRef<PoolClient | null>(null);

  useLayoutEffect(() => {
    setNetworkId(readStoredNetworkId());
  }, []);

  useEffect(() => subscribeNetworkChange(setNetworkId), []);

  useLayoutEffect(() => {
    const cached = loadCachedSnapshot(networkId);
    setSnapshot(cached);
    setReadError(null);
    setPhase(cached ? 'ready' : 'loading');
  }, [networkId]);

  useEffect(() => {
    if (!network.enabled || !contracts) {
      return;
    }
    const pool = new StickyRpcPool(
      network.rpcUrls,
      network.chainId,
      network.name,
      sessionStickyStore(),
      `${RPC_STICKY_PREFIX}${network.id}`,
      globalThis.fetch.bind(globalThis),
    );
    poolRef.current = pool;
    clientRef.current = createPoolClient(network, pool);

    let cancelled = false;
    const load = async (force = false) => {
      if (!force && document.hidden) {
        return;
      }
      try {
        const next = await readSnapshot(clientRef.current!, contracts);
        if (cancelled) {
          return;
        }
        saveCachedSnapshot(networkId, next);
        setSnapshot(next);
        setPhase('ready');
        setReadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error('Nether protocol read failed', error);
        if (isRpcUnavailable(error)) {
          setPhase('rpc-down');
          return;
        }
        setPhase('read-error');
        setReadError(rootErrorMessage(error, 'The selected network’s contracts could not be read.'));
      }
    };

    void load(true);
    const timer = window.setInterval(() => {
      void load(false);
    }, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) {
        void load(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [network, contracts, networkId, retryNonce]);

  const retry = () => {
    poolRef.current?.resetToStart();
    if (!snapshot) {
      setPhase('loading');
    }
    setRetryNonce((value) => value + 1);
  };

  return {
    networkId,
    network,
    contracts,
    snapshot,
    phase,
    readError,
    retry,
    poolRef,
    clientRef,
  };
}
