import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NETWORK_STORAGE_KEY,
  NETWORKS,
  contractsOn,
  firstEnabledNetworkId,
  resolveNetworkId,
  type NetworkId,
} from '../../lib/networks.ts';
import { parseAmount } from '../../lib/format.ts';
import {
  ContractReadError,
  createPoolClient,
  quoteBuryAmount,
  quoteReaperAmount,
  readSnapshot,
  type PoolClient,
  type ProtocolSnapshot,
} from '../../lib/protocol.ts';
import {
  RPC_STICKY_PREFIX,
  RpcUnavailableError,
  StickyRpcPool,
  sessionStickyStore,
} from '../../lib/rpcPool.ts';
import { GravePanel } from './GravePanel.tsx';
import { NethBar } from './NethBar.tsx';
import { ReaperPanel } from './ReaperPanel.tsx';
import { RpcDown } from './RpcDown.tsx';
import { TopStats } from './TopStats.tsx';

const POLL_MS = 12_000;

export function DashboardApp() {
  const [networkId, setNetworkId] = useState<NetworkId>(firstEnabledNetworkId());
  const [phase, setPhase] = useState<'loading' | 'ready' | 'rpc-down' | 'read-error'>('loading');
  const [snapshot, setSnapshot] = useState<ProtocolSnapshot | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [buryInput, setBuryInput] = useState('');
  const [sellInput, setSellInput] = useState('');
  const [buryQuote, setBuryQuote] = useState<bigint | null>(0n);
  const [sellQuote, setSellQuote] = useState<bigint | null>(0n);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const network = NETWORKS[networkId];
  const contracts = useMemo(() => contractsOn(network), [network]);
  const poolRef = useRef<StickyRpcPool | null>(null);
  const clientRef = useRef<PoolClient | null>(null);

  useEffect(() => {
    setNetworkId(resolveNetworkId(window.localStorage.getItem(NETWORK_STORAGE_KEY)));
  }, []);

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
      fetch,
    );
    poolRef.current = pool;
    clientRef.current = createPoolClient(network, pool);

    let cancelled = false;
    const load = async () => {
      if (document.hidden) {
        return;
      }
      try {
        const next = await readSnapshot(clientRef.current!, contracts);
        if (cancelled) {
          return;
        }
        setSnapshot(next);
        setPhase('ready');
        setReadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof RpcUnavailableError) {
          setPhase('rpc-down');
          setSnapshot(null);
          return;
        }
        setPhase('read-error');
        setReadError(error instanceof ContractReadError ? error.message : 'The selected network’s contracts could not be read.');
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [networkId, retryNonce]);

  useEffect(() => {
    const client = clientRef.current;
    const pool = poolRef.current;
    if (!client || !pool || !contracts || phase !== 'ready') {
      return;
    }
    const amount = parseAmount(buryInput);
    if (amount == null) {
      setBuryQuote(null);
      return;
    }
    let cancelled = false;
    void pool
      .withRetryStickyOnce(() => quoteBuryAmount(client, contracts.grave, amount))
      .then((quoted) => {
        if (!cancelled) {
          setBuryQuote(quoted);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error instanceof RpcUnavailableError) {
          setPhase('rpc-down');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [buryInput, phase, snapshot, contracts]);

  useEffect(() => {
    const client = clientRef.current;
    const pool = poolRef.current;
    const auction = snapshot?.auction;
    const live = Boolean(auction?.active && snapshot && snapshot.now < auction.endTime);
    if (!client || !pool || !contracts || phase !== 'ready' || !live) {
      setSellQuote(0n);
      return;
    }
    const amount = parseAmount(sellInput);
    if (amount == null) {
      setSellQuote(null);
      return;
    }
    let cancelled = false;
    void pool
      .withRetryStickyOnce(() => quoteReaperAmount(client, contracts.reaper, amount))
      .then((quoted) => {
        if (!cancelled) {
          setSellQuote(quoted);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error instanceof RpcUnavailableError) {
          setPhase('rpc-down');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sellInput, phase, snapshot, contracts]);

  const selectNetwork = (id: NetworkId) => {
    if (!NETWORKS[id].enabled) {
      return;
    }
    window.localStorage.setItem(NETWORK_STORAGE_KEY, id);
    setNetworkId(id);
    setPhase('loading');
    setSnapshot(null);
  };

  const retry = () => {
    poolRef.current?.resetToStart();
    setPhase('loading');
    setRetryNonce((value) => value + 1);
  };

  if (phase === 'rpc-down') {
    return (
      <div className="px-5 py-10 md:px-10 md:py-14">
        <RpcDown network={network} contracts={contracts} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-6 md:px-10 md:py-8">
      {phase === 'read-error' ? (
        <p className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-paper" role="alert">
          {readError ?? 'The selected network’s contracts could not be read.'}
        </p>
      ) : null}
      <TopStats snapshot={snapshot} />
      <GravePanel
        snapshot={snapshot}
        network={network}
        contracts={contracts}
        buryInput={buryInput}
        buryQuote={buryQuote}
        onBuryInput={setBuryInput}
      />
      <ReaperPanel
        snapshot={snapshot}
        network={network}
        contracts={contracts}
        sellInput={sellInput}
        sellQuote={sellQuote}
        onSellInput={setSellInput}
      />
      <NethBar
        snapshot={snapshot}
        network={network}
        contracts={contracts}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((open) => !open)}
        onSelectNetwork={selectNetwork}
      />
    </div>
  );
}
