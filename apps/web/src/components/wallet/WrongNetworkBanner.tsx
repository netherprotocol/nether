import { useState } from 'react';
import { useAccount } from 'wagmi';
import type { NetworkConfig } from '../../lib/networks.ts';
import { switchOrAddChain } from '../../lib/chainSwitch.ts';
import { NetworkGuide } from './NetworkGuide.tsx';
import { addChainExplicit, eip1193From } from './provider.ts';

export function WrongNetworkBanner({ network }: { network: NetworkConfig }) {
  const { chainId, connector, isConnected } = useAccount();
  const [guide, setGuide] = useState(false);
  const mismatched = Boolean(isConnected && chainId != null && chainId !== network.chainId);

  if (!mismatched) {
    return null;
  }

  async function onSwitch() {
    const provider = await eip1193From(connector);
    const result = await switchOrAddChain(provider, network);
    if (result.kind === 'guide') {
      setGuide(true);
    }
  }

  async function onAdd() {
    const provider = await eip1193From(connector);
    const result = await addChainExplicit(provider, network);
    if (result.kind === 'guide') {
      setGuide(true);
    }
  }

  return (
    <>
      <p
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-paper"
        role="alert"
      >
        <span>This wallet is not on {network.walletChainName}.</span>
        <span className="flex flex-wrap gap-2">
          <button
            type="button"
            className="bg-accent px-3 py-1.5 text-[0.65rem] tracking-[0.18em] text-white uppercase"
            onClick={() => {
              void onSwitch();
            }}
          >
            Switch network
          </button>
          <button
            type="button"
            className="border border-white/20 px-3 py-1.5 text-[0.65rem] tracking-[0.18em] text-white uppercase"
            onClick={() => {
              void onAdd();
            }}
          >
            Add {network.walletChainName}
          </button>
          <button
            type="button"
            className="border border-white/20 px-3 py-1.5 text-[0.65rem] tracking-[0.18em] text-white uppercase"
            onClick={() => setGuide(true)}
          >
            Show manual steps
          </button>
        </span>
      </p>
      {guide ? <NetworkGuide network={network} onClose={() => setGuide(false)} /> : null}
    </>
  );
}
