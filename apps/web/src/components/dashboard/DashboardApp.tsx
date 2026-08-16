import { useEffect, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { base, baseSepolia } from 'viem/chains';
import type { Address, Chain, Hex } from 'viem';
import { graveAbi, nethAbi, reaperAbi } from '../../lib/abi.ts';
import { parseAmount } from '../../lib/format.ts';
import { quoteBuryAmount, quoteReaperAmount, type PoolClient } from '../../lib/protocol.ts';
import { MIN_GAS_RESERVE_WEI } from '../../lib/slippage.ts';
import { simulateThenSend, waitOneConfirmation, type WalletWriter } from '../../lib/tx.ts';
import { isUserRejected, revertShortMessage } from '../../lib/errors.ts';
import { useLiveSnapshot } from '../useLiveSnapshot.ts';
import { WalletProviders } from '../wallet/WalletProviders.tsx';
import { WrongNetworkBanner } from '../wallet/WrongNetworkBanner.tsx';
import { GravePanel } from './GravePanel.tsx';
import { NethBar } from './NethBar.tsx';
import { ReaperPanel } from './ReaperPanel.tsx';
import { RpcDown } from './RpcDown.tsx';
import { TopStats } from './TopStats.tsx';

export function DashboardApp() {
  return (
    <WalletProviders>
      <DashboardBody />
    </WalletProviders>
  );
}

function DashboardBody() {
  const { network, contracts, snapshot, phase, readError, retry, refreshSnapshot, poolRef, clientRef } =
    useLiveSnapshot();
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const onChain = Boolean(isConnected && address && chainId === network.chainId);
  const [buryInput, setBuryInput] = useState('');
  const [sellInput, setSellInput] = useState('');
  const [buryQuote, setBuryQuote] = useState<bigint | null>(0n);
  const [sellQuote, setSellQuote] = useState<bigint | null>(0n);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [nethBalance, setNethBalance] = useState<bigint | null>(null);
  const [nethAllowance, setNethAllowance] = useState<bigint | null>(null);
  const [gasReserve, setGasReserve] = useState(MIN_GAS_RESERVE_WEI);
  const [balanceTick, setBalanceTick] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

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

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !contracts || !address || !onChain) {
      setEthBalance(null);
      setNethBalance(null);
      setNethAllowance(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      client.getBalance({ address }),
      client.readContract({
        address: contracts.neth,
        abi: nethAbi,
        functionName: 'balanceOf',
        args: [address],
      }),
      client.readContract({
        address: contracts.neth,
        abi: nethAbi,
        functionName: 'allowance',
        args: [address, contracts.reaper],
      }),
      client
        .getGasPrice()
        .then((price) => {
          const estimate = 500_000n * price * 2n;
          return estimate > MIN_GAS_RESERVE_WEI ? estimate : MIN_GAS_RESERVE_WEI;
        })
        .catch(() => MIN_GAS_RESERVE_WEI),
    ])
      .then(([eth, neth, allowance, reserve]) => {
        if (!cancelled) {
          setEthBalance(eth);
          setNethBalance(neth);
          setNethAllowance(allowance);
          setGasReserve(reserve);
        }
      })
      .catch(() => {
        // Snapshot polling already surfaces RPC loss.
      });
    return () => {
      cancelled = true;
    };
  }, [address, onChain, contracts, snapshot, balanceTick, clientRef]);

  async function runWrite(
    action: string,
    send: (ctx: { client: PoolClient; writer: WalletWriter; account: Address; chain: Chain }) => Promise<Hex>,
  ): Promise<'ok' | 'rejected' | 'error' | 'busy'> {
    const client = clientRef.current;
    if (!client || !walletClient || !address || !onChain || pending) {
      return 'busy';
    }
    setPending(action);
    setLastAction(action);
    setTxError(null);
    setTxHash(null);
    try {
      const hash = await send({
        client,
        writer: walletClient as unknown as WalletWriter,
        account: address,
        chain: network.chainId === 8453 ? base : baseSepolia,
      });
      setTxHash(hash);
      await waitOneConfirmation(client, hash);
      refreshSnapshot();
      setBalanceTick((value) => value + 1);
      return 'ok';
    } catch (error) {
      if (isUserRejected(error)) {
        return 'rejected';
      }
      setTxError(revertShortMessage(error));
      return 'error';
    } finally {
      setPending(null);
    }
  }

  const onBury = (amount: bigint, minNethOut: bigint) =>
    runWrite('bury', ({ client, writer, account, chain }) =>
      simulateThenSend({
        publicClient: client,
        walletClient: writer,
        account,
        chain,
        address: contracts!.grave,
        abi: graveAbi,
        functionName: 'bury',
        args: [minNethOut],
        value: amount,
      }),
    );

  const onApprove = (amount: bigint) =>
    runWrite('approve', ({ client, writer, account, chain }) =>
      simulateThenSend({
        publicClient: client,
        walletClient: writer,
        account,
        chain,
        address: contracts!.neth,
        abi: nethAbi,
        functionName: 'approve',
        args: [contracts!.reaper, amount],
      }),
    );

  const onSell = (amount: bigint, minEthOut: bigint) =>
    runWrite('sell', ({ client, writer, account, chain }) =>
      simulateThenSend({
        publicClient: client,
        walletClient: writer,
        account,
        chain,
        address: contracts!.reaper,
        abi: reaperAbi,
        functionName: 'sellToReaper',
        args: [amount, minEthOut],
      }),
    );

  const onStart = () =>
    runWrite('start', ({ client, writer, account, chain }) =>
      simulateThenSend({
        publicClient: client,
        walletClient: writer,
        account,
        chain,
        address: contracts!.reaper,
        abi: reaperAbi,
        functionName: 'startAuction',
      }),
    );

  const onFinalize = () =>
    runWrite('finalize', ({ client, writer, account, chain }) =>
      simulateThenSend({
        publicClient: client,
        walletClient: writer,
        account,
        chain,
        address: contracts!.reaper,
        abi: reaperAbi,
        functionName: 'finalizeAuction',
      }),
    );

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
      <WrongNetworkBanner network={network} />
      <TopStats snapshot={snapshot} />
      <GravePanel
        snapshot={snapshot}
        network={network}
        contracts={contracts}
        buryInput={buryInput}
        buryQuote={buryQuote}
        onBuryInput={setBuryInput}
        connected={isConnected}
        onChain={onChain}
        ethBalance={ethBalance}
        gasReserve={gasReserve}
        pending={pending}
        error={lastAction === 'bury' ? txError : null}
        hash={lastAction === 'bury' ? txHash : null}
        onBury={onBury}
      />
      <ReaperPanel
        snapshot={snapshot}
        network={network}
        contracts={contracts}
        sellInput={sellInput}
        sellQuote={sellQuote}
        onSellInput={setSellInput}
        connected={isConnected}
        onChain={onChain}
        nethBalance={nethBalance}
        nethAllowance={nethAllowance}
        pending={pending}
        error={txError}
        hash={txHash}
        lastAction={lastAction}
        onApprove={onApprove}
        onSell={onSell}
        onStart={onStart}
        onFinalize={onFinalize}
      />
      <NethBar
        snapshot={snapshot}
        network={network}
        contracts={contracts}
        connected={isConnected}
        onChain={onChain}
        nethBalance={nethBalance}
      />
    </div>
  );
}
