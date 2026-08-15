import { useEffect, useState } from 'react';
import { parseAmount } from '../../lib/format.ts';
import { quoteBuryAmount, quoteReaperAmount } from '../../lib/protocol.ts';
import { useLiveSnapshot } from '../useLiveSnapshot.ts';
import { GravePanel } from './GravePanel.tsx';
import { NethBar } from './NethBar.tsx';
import { ReaperPanel } from './ReaperPanel.tsx';
import { RpcDown } from './RpcDown.tsx';
import { TopStats } from './TopStats.tsx';

export function DashboardApp() {
  const { network, contracts, snapshot, phase, readError, retry, poolRef, clientRef } =
    useLiveSnapshot();
  const [buryInput, setBuryInput] = useState('');
  const [sellInput, setSellInput] = useState('');
  const [buryQuote, setBuryQuote] = useState<bigint | null>(0n);
  const [sellQuote, setSellQuote] = useState<bigint | null>(0n);

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
      .catch(() => {
        // Snapshot polling already surfaces RPC loss.
      });
    return () => {
      cancelled = true;
    };
  }, [buryInput, phase, snapshot, contracts, clientRef, poolRef]);

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
      .catch(() => {
        // Snapshot polling already surfaces RPC loss.
      });
    return () => {
      cancelled = true;
    };
  }, [sellInput, phase, snapshot, contracts, clientRef, poolRef]);

  if (phase === 'rpc-down' && !snapshot) {
    return (
      <div className="px-5 py-10 md:px-10 md:py-14">
        <RpcDown network={network} contracts={contracts} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-6 md:px-10 md:py-8">
      {phase === 'read-error' || (phase === 'rpc-down' && snapshot) ? (
        <p
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-paper"
          role="alert"
        >
          <span>
            {phase === 'rpc-down'
              ? `${network.name} RPC is currently unavailable. Showing the last saved snapshot.`
              : (readError ?? 'The selected network’s contracts could not be read.')}
          </span>
          <button
            type="button"
            className="bg-accent px-3 py-1.5 text-[0.65rem] tracking-[0.18em] text-white uppercase"
            onClick={retry}
          >
            Retry
          </button>
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
      <NethBar snapshot={snapshot} network={network} contracts={contracts} />
    </div>
  );
}
