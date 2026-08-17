import { Wallet } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useBalance, useReadContract } from 'wagmi';
import { nethAbi } from '../../lib/abi.ts';
import {
  NETWORKS,
  contractsOn,
  firstEnabledNetworkId,
  readStoredNetworkId,
  subscribeNetworkChange,
  type NetworkId,
} from '../../lib/networks.ts';
import { formatWei, truncateAddress } from '../../lib/format.ts';
import { switchOrAddChain } from '../../lib/chainSwitch.ts';
import { markAddedChain, markAddedNeth, shouldOfferAddChain, shouldOfferAddNeth } from '../../lib/walletPrefs.ts';
import { AccountMenu } from './AccountMenu.tsx';
import { ConnectModal } from './ConnectModal.tsx';
import { NetworkGuide } from './NetworkGuide.tsx';
import { TokenGuide } from './TokenGuide.tsx';
import { addChainExplicit, addNethToken, eip1193From } from './provider.ts';

export function ConnectButton({ variant = 'header' }: { variant?: 'header' | 'dock' }) {
  const [networkId, setNetworkId] = useState<NetworkId>(firstEnabledNetworkId);
  const [connectOpen, setConnectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [networkGuide, setNetworkGuide] = useState(false);
  const [tokenGuide, setTokenGuide] = useState(false);
  const [prefTick, setPrefTick] = useState(0);
  const { address, isConnected, chainId, connector } = useAccount();
  const network = NETWORKS[networkId];
  const contracts = contractsOn(network);
  const onChain = Boolean(isConnected && address && chainId === network.chainId);
  const attempted = useRef('');
  const { data: balance } = useBalance({
    address,
    chainId: network.chainId,
    query: { enabled: Boolean(address && onChain) },
  });
  const { data: nethBalance } = useReadContract({
    address: contracts?.neth,
    abi: nethAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: network.chainId,
    query: {
      enabled: Boolean(address && onChain && contracts?.neth),
      refetchInterval: 12_000,
    },
  });

  useLayoutEffect(() => {
    setNetworkId(readStoredNetworkId());
  }, []);
  useEffect(() => subscribeNetworkChange(setNetworkId), []);

  useEffect(() => {
    if (onChain) {
      markAddedChain(network.chainId);
    }
  }, [onChain, network.chainId]);

  useEffect(() => {
    if (!isConnected || !connector || !address) {
      return;
    }
    const key = `${address}:${network.chainId}`;
    if (chainId === network.chainId || attempted.current === key) {
      return;
    }
    attempted.current = key;
    void (async () => {
      const provider = await eip1193From(connector);
      const result = await switchOrAddChain(provider, network);
      if (result.kind === 'guide') {
        setNetworkGuide(true);
      }
      if (result.kind === 'matched' || result.kind === 'switched' || result.kind === 'added') {
        markAddedChain(network.chainId);
        setPrefTick((value) => value + 1);
      }
    })();
  }, [address, chainId, connector, isConnected, network]);

  const handleAddNetwork = useCallback(async () => {
    setMenuOpen(false);
    markAddedChain(network.chainId);
    setPrefTick((value) => value + 1);
    const provider = await eip1193From(connector);
    const result = await addChainExplicit(provider, network);
    if (result.kind === 'guide') {
      setNetworkGuide(true);
    }
  }, [connector, network]);

  const handleAddNeth = useCallback(async () => {
    setMenuOpen(false);
    if (!contracts?.neth) {
      return;
    }
    markAddedNeth(network.chainId, contracts.neth);
    setPrefTick((value) => value + 1);
    const provider = await eip1193From(connector);
    const result = await addNethToken(provider, contracts.neth);
    if (result === 'guide') {
      setTokenGuide(true);
    }
  }, [connector, contracts, network.chainId]);

  const showAddNetwork = useMemo(
    () => shouldOfferAddChain(onChain, network.chainId),
    [onChain, network.chainId, prefTick],
  );
  const showAddNeth = useMemo(
    () => shouldOfferAddNeth(network.chainId, contracts?.neth),
    [network.chainId, contracts?.neth, prefTick],
  );

  if (!isConnected || !address) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className={
            variant === 'dock'
              ? 'inline-flex w-full items-center justify-center gap-2 bg-accent px-3 py-2.5 text-[0.62rem] tracking-[0.16em] text-white uppercase'
              : 'inline-flex items-center gap-1.5 bg-accent px-2.5 py-1.5 text-[0.62rem] tracking-[0.14em] text-white uppercase md:px-3 md:text-[0.68rem]'
          }
        >
          <Wallet className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          {variant === 'dock' ? (
            'Connect wallet'
          ) : (
            <>
              <span className="hidden sm:inline">Connect wallet</span>
              <span className="sm:hidden">Connect</span>
            </>
          )}
        </button>
        {connectOpen ? <ConnectModal onClose={() => setConnectOpen(false)} /> : null}
      </>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        className={[
          variant === 'dock'
            ? 'inline-flex w-full items-center justify-center gap-2 border px-2.5 py-2.5 text-[0.62rem] tracking-[0.04em]'
            : 'inline-flex items-center gap-2 border px-2.5 py-1.5 text-[0.68rem] tracking-[0.04em] md:px-3',
          onChain ? 'border-white/10 text-white' : 'border-accent/60 text-accent',
        ].join(' ')}
      >
        <span className="font-mono">{truncateAddress(address)}</span>
        {onChain ? (
          <span className={variant === 'dock' ? 'truncate text-white' : 'text-white'}>
            {nethBalance != null ? `${formatWei(nethBalance, 4)} $NETH` : '…'}
          </span>
        ) : null}
        {onChain && balance && variant !== 'dock' ? (
          <span className="hidden text-muted md:inline">{formatWei(balance.value, 4)} ETH</span>
        ) : null}
      </button>
      {menuOpen ? (
        <AccountMenu
          address={address}
          network={network}
          showAddNetwork={showAddNetwork}
          showAddNeth={showAddNeth}
          placement={variant === 'dock' ? 'top' : 'bottom'}
          onAddNetwork={() => {
            void handleAddNetwork();
          }}
          onAddNeth={() => {
            void handleAddNeth();
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      {networkGuide ? <NetworkGuide network={network} onClose={() => setNetworkGuide(false)} /> : null}
      {tokenGuide && contracts?.neth ? (
        <TokenGuide network={network} address={contracts.neth} onClose={() => setTokenGuide(false)} />
      ) : null}
    </div>
  );
}
