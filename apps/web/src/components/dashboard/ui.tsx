import type { ReactNode } from 'react';
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { NethMark } from '../NethMark.tsx';
import { explorerAddressUrl, explorerTxUrl, type NetworkConfig } from '../../lib/networks.ts';
import { truncateAddress } from '../../lib/format.ts';
import { percentToBps } from '../../lib/slippage.ts';

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

export function SlippageControl({ bps, onChange }: { bps: number; onChange: (bps: number) => void }) {
  const presets = [10, 50, 100] as const;
  const isPreset = (presets as readonly number[]).includes(bps);
  const [customOn, setCustomOn] = useState(!isPreset);
  const [customText, setCustomText] = useState(isPreset ? '' : String(bps / 100));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="tracking-[0.12em] uppercase">Slippage</span>
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => {
            setCustomOn(false);
            onChange(preset);
          }}
          className={[
            'border px-2 py-1',
            !customOn && bps === preset ? 'border-accent text-white' : 'border-white/10',
          ].join(' ')}
        >
          {preset / 100}%
        </button>
      ))}
      <button
        type="button"
        onClick={() => setCustomOn(true)}
        className={['border px-2 py-1', customOn ? 'border-accent text-white' : 'border-white/10'].join(' ')}
      >
        Custom
      </button>
      {customOn ? (
        <label className="inline-flex items-center gap-1">
          <input
            className="w-16 border border-white/10 bg-black/40 px-1.5 py-1 text-white outline-none"
            inputMode="decimal"
            value={customText}
            aria-label="Custom slippage percent"
            onChange={(event) => {
              setCustomText(event.target.value);
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) {
                onChange(percentToBps(parsed));
              }
            }}
          />
          <span>%</span>
        </label>
      ) : null}
    </div>
  );
}

export function ActionFeedback({
  pending,
  error,
  hash,
  network,
}: {
  pending: string | null;
  error: string | null;
  hash: string | null;
  network: NetworkConfig;
}) {
  if (error) {
    return <p className="mt-2 text-sm text-accent">{error}</p>;
  }
  if (pending) {
    return <p className="mt-2 text-sm text-muted">Confirm in wallet…</p>;
  }
  if (hash) {
    return (
      <p className="mt-2 text-sm">
        <a
          className="inline-flex items-center gap-1 text-paper hover:text-white"
          href={explorerTxUrl(network, hash)}
          rel="noopener noreferrer"
          target="_blank"
        >
          Transaction confirmed
          <ExternalLink className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
        </a>
      </p>
    );
  }
  return null;
}
