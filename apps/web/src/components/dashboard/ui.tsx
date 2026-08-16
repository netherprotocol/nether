import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { NethMark } from '../NethMark.tsx';
import { explorerAddressUrl, type NetworkConfig } from '../../lib/networks.ts';
import { truncateAddress } from '../../lib/format.ts';

export function Tip({
  text,
  children,
  block,
}: {
  text: string;
  children: ReactNode;
  block?: boolean;
}) {
  return (
    <span className={block ? 'dash-tip dash-tip-block' : 'dash-tip'}>
      {children}
      <span role="tooltip" className="dash-tip-box">
        {text}
      </span>
    </span>
  );
}

export function AddressLink({
  address,
  network,
  label,
}: {
  address: string;
  network: NetworkConfig;
  label?: string;
}) {
  return (
    <a
      className="inline-flex items-center gap-1.5 text-paper hover:text-white"
      href={explorerAddressUrl(network, address)}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="font-mono text-sm">{label ?? truncateAddress(address)}</span>
      <ExternalLink className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} aria-hidden="true" />
    </a>
  );
}

export function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <p className="text-[0.72rem] tracking-[0.12em] text-muted uppercase">{label}</p>
      <div className="text-right text-sm text-white">{children}</div>
    </div>
  );
}

export function SkeletonValue() {
  return <span className="inline-block h-4 w-24 animate-pulse rounded bg-white/10" />;
}

export function TokenChip({ label, neth }: { label: string; neth?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[0.68rem] tracking-[0.14em] text-paper uppercase">
      {neth ? <NethMark className="h-3.5 w-3.5 text-accent" /> : null}
      {label}
    </span>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const width = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
      <span className="text-sm text-white">{Math.round(width)}%</span>
    </div>
  );
}

export function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={active ? 'h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'h-2 w-2 rounded-full bg-white/30'}
      aria-hidden="true"
    />
  );
}
