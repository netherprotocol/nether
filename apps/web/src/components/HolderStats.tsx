import { formatWei, WAD } from '../lib/format.ts';
import { STATS } from '../lib/site.ts';
import { AddressLink } from './dashboard/ui.tsx';
import { useLiveSnapshot } from './useLiveSnapshot.ts';

export function HolderStats() {
  const { snapshot, network, contracts } = useLiveSnapshot();
  const eraMint =
    snapshot != null ? (snapshot.currentEraCapacity * snapshot.currentRewardRate) / WAD : null;

  const stats = [
    {
      label: STATS[0].label,
      value: snapshot ? `${formatWei(snapshot.protectedPrincipal)} ETH` : STATS[0].value,
      detail: STATS[0].detail,
    },
    {
      label: STATS[1].label,
      value: snapshot ? `${formatWei(snapshot.nethSupply)} $NETH` : STATS[1].value,
      detail: eraMint != null ? `${formatWei(eraMint)} $NETH / era` : STATS[1].detail,
    },
    {
      label: STATS[2].label,
      value: snapshot
        ? `${formatWei(snapshot.currentRewardRate, 0)} $NETH / 1 ETH`
        : STATS[2].value,
      detail: STATS[2].detail,
    },
    {
      label: STATS[3].label,
      value: null as string | null,
      detail: STATS[3].detail,
    },
  ];

  return (
    <section
      className="mt-auto flex shrink-0 flex-col border-t border-white/10 bg-[#0b0b0b] md:flex-row md:items-stretch"
      aria-label="Protocol facts"
    >
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="flex-1 border-b border-white/10 px-5 py-3 md:border-r md:border-b-0 md:last:border-r-0 md:px-8 md:py-3.5"
        >
          <p className="text-[0.62rem] tracking-[0.22em] text-accent uppercase">{stat.label}</p>
          {index === 3 ? (
            <p className="mt-1 text-sm font-light text-white md:text-[0.95rem]">
              {contracts ? (
                <AddressLink address={contracts.grave} network={network} />
              ) : (
                STATS[3].value
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm font-light text-white md:text-[0.95rem]">{stat.value}</p>
          )}
          {stat.detail ? (
            <p className="mt-0.5 text-[0.75rem] font-light text-paper/65">{stat.detail}</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
