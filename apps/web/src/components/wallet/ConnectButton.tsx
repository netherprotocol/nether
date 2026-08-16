import { Wallet } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
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
import { AccountMenu } from './AccountMenu.tsx';
import { ConnectModal } from './ConnectModal.tsx';
import { NetworkGuide } from './NetworkGuide.tsx';
import { TokenGuide } from './TokenGuide.tsx';
import { addChainExplicit, addNethToken, eip1193From } from './provider.ts';

export function ConnectButton() {
  const [networkId, setNetworkId] = useState<NetworkId>(firstEnabledNetworkId);
  const [connectOpen, setConnectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [networkGuide, setNetworkGuide] = useState(false);
  const [tokenGuide, setTokenGuide] = useState(false);
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

  useLayoutEffect(() => {
    setNetworkId(readStoredNetworkId());
  }, []);
  useEffect(() => subscribeNetworkChange(setNetworkId), []);

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
    })();
  }, [address, chainId, connector, isConnected, network]);

  const handleAddNetwork = useCallback(async () => {
    setMenuOpen(false);
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
    const provider = await eip1193From(connector);
    const result = await addNethToken(provider, contracts.neth);
    if (result === 'guide') {
      setTokenGuide(true);
    }
  }, [connector, contracts]);

  if (!isConnected || !address) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="inline-flex items-center gap-1.5 bg-accent px-2.5 py-1.5 text-[0.62rem] tracking-[0.14em] text-white uppercase md:px-3 md:text-[0.68rem]"
        >
          <Wallet className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden sm:inline">Connect wallet</span>
          <span className="sm:hidden">Connect</span>
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
          'inline-flex items-center gap-2 border px-2.5 py-1.5 text-[0.68rem] tracking-[0.04em] md:px-3',
          onChain ? 'border-white/10 text-white' : 'border-accent/60 text-accent',
        ].join(' ')}
      >
        <span className="font-mono">{truncateAddress(address)}</span>
        {onChain && balance ? (
          <span className="hidden text-muted md:inline">{formatWei(balance.value, 4)} ETH</span>
        ) : null}
      </button>
      {menuOpen ? (
        <AccountMenu
          address={address}
          network={network}
          nethAddress={contracts?.neth}
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
