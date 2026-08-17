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
      shortLabel: 'Total ETH Buried',
      value: snapshot ? formatEth(snapshot.protectedPrincipal) : null,
    },
    {
      icon: <NethMark className={iconClass} />,
      label: '$NETH Total Supply',
      shortLabel: 'Total Supply',
      value: snapshot ? formatNeth(snapshot.nethSupply) : null,
    },
    {
      icon: <Hourglass className={iconClass} strokeWidth={1.25} aria-hidden="true" />,
      label: 'Current Era',
      shortLabel: 'Current Era',
      value: snapshot ? snapshot.currentEra.toString() : null,
    },
    {
      icon: <Skull className={iconClass} strokeWidth={1.25} aria-hidden="true" />,
      label: 'Reaper Status',
      shortLabel: 'Reaper Status',
      value: snapshot ? (auctionActive ? 'Auction active' : 'Inactive') : null,
      active: auctionActive,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3" aria-label="Protocol snapshot">
      {cards.map((card) => (
        <article
          key={card.label}
          className="rounded-xl border border-white/10 bg-[#0c0c0c] px-3 py-2.5 md:flex md:items-center md:gap-3 md:px-4 md:py-3.5"
        >
          <span className="hidden md:inline-flex">{card.icon}</span>
          <div className="min-w-0">
            <p className="text-[0.58rem] tracking-[0.12em] text-muted uppercase md:text-[0.62rem] md:tracking-[0.18em]">
              <span className="md:hidden">{card.shortLabel}</span>
              <span className="hidden md:inline">{card.label}</span>
            </p>
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
