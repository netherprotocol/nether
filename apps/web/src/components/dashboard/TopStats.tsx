import { Landmark, Hourglass, Skull } from 'lucide-react';
import { NethMark } from '../NethMark.tsx';
import type { ProtocolSnapshot } from '../../lib/protocol.ts';
import { formatEth, formatNeth } from '../../lib/format.ts';
import { SkeletonValue, StatusDot } from './ui.tsx';

const iconClass = 'h-5 w-5 text-accent';

export function TopStats({ snapshot }: { snapshot: ProtocolSnapshot | null }) {
  const auctionActive = snapshot?.auction.active === true;
  const cards = [
    {
      icon: <Landmark className={iconClass} strokeWidth={1.25} aria-hidden="true" />,
      label: 'Total ETH Buried',
      value: snapshot ? formatEth(snapshot.protectedPrincipal) : null,
    },
    {
      icon: <NethMark className={iconClass} />,
      label: '$NETH Total Supply',
      value: snapshot ? formatNeth(snapshot.nethSupply) : null,
    },
    {
      icon: <Hourglass className={iconClass} strokeWidth={1.25} aria-hidden="true" />,
      label: 'Current Era',
      value: snapshot ? snapshot.currentEra.toString() : null,
    },
    {
      icon: <Skull className={iconClass} strokeWidth={1.25} aria-hidden="true" />,
      label: 'Reaper Status',
      value: snapshot ? (auctionActive ? 'Auction active' : 'Inactive') : null,
      active: auctionActive,
    },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-4" aria-label="Protocol snapshot">
      {cards.map((card) => (
        <article
          key={card.label}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0c0c0c] px-4 py-3.5"
        >
          {card.icon}
          <div className="min-w-0">
            <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">{card.label}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-white">
              {card.value ?? <SkeletonValue />}
              {card.value && 'active' in card ? <StatusDot active={card.active === true} /> : null}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}
