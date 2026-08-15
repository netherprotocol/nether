import { useEffect, useLayoutEffect, useState } from 'react';
import {
  NETWORK_ORDER,
  NETWORKS,
  firstEnabledNetworkId,
  persistNetworkId,
  readStoredNetworkId,
  subscribeNetworkChange,
  type NetworkId,
} from '../lib/networks.ts';
import { Tip } from './dashboard/ui.tsx';

export function NetworkSwitch() {
  const [networkId, setNetworkId] = useState<NetworkId>(firstEnabledNetworkId);

  useLayoutEffect(() => {
    setNetworkId(readStoredNetworkId());
  }, []);

  useEffect(() => subscribeNetworkChange(setNetworkId), []);

  return (
    <div className="inline-flex rounded-md border border-white/10 p-0.5" role="group" aria-label="Network">
      {NETWORK_ORDER.map((id) => {
        const item = NETWORKS[id];
        const selected = networkId === id;
        const button = (
          <button
            key={id}
            type="button"
            disabled={!item.enabled}
            aria-disabled={!item.enabled}
            aria-pressed={selected}
            title={item.enabled ? item.name : item.disabledReason}
            onClick={() => {
              persistNetworkId(id);
              setNetworkId(id);
            }}
            className={[
              'inline-flex items-center gap-1.5 px-2 py-1.5 text-[0.62rem] tracking-[0.08em] uppercase md:px-2.5 md:text-[0.68rem]',
              selected ? 'bg-accent text-white' : 'text-muted',
              item.enabled ? 'cursor-pointer hover:text-white' : 'pointer-events-none cursor-not-allowed opacity-50',
            ].join(' ')}
          >
            <span className="h-2 w-2 rounded-full bg-[#0052FF]" aria-hidden="true" />
            {item.name}
          </button>
        );
        if (item.enabled) {
          return button;
        }
        return (
          <Tip key={id} text={item.disabledReason ?? 'Unavailable'}>
            {button}
          </Tip>
        );
      })}
    </div>
  );
}
