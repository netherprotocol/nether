import type { ReactNode } from 'react';
import { useState } from 'react';
import { Copy, ExternalLink, Settings } from 'lucide-react';
import { NethMark } from '../NethMark.tsx';
import { explorerAddressUrl, explorerTxUrl, type NetworkConfig } from '../../lib/networks.ts';
import { formatAmountInput, truncateAddress } from '../../lib/format.ts';
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
  const [open, setOpen] = useState(false);
  return (
    <span
      className={[block ? 'dash-tip dash-tip-block' : 'dash-tip', open ? 'dash-tip-open' : '']
        .filter(Boolean)
        .join(' ')}
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((value) => !value);
      }}
    >
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
    <span className="inline-flex items-center gap-1.5">
      <a
        className="inline-flex items-center gap-1.5 text-paper hover:text-white"
        href={explorerAddressUrl(network, address)}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span className="font-mono text-sm">{label ?? truncateAddress(address)}</span>
        <ExternalLink className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} aria-hidden="true" />
      </a>
      <CopyButton value={address} className="md:hidden" />
    </span>
  );
}

export function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={['p-0.5 text-accent hover:text-white', className].filter(Boolean).join(' ')}
      aria-label={copied ? 'Copied' : 'Copy'}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
    </button>
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

export function AmountPercents({
  max,
  disabled,
  onSelect,
  onSettings,
}: {
  max: bigint;
  disabled?: boolean;
  onSelect: (value: string) => void;
  onSettings?: () => void;
}) {
  const presets = [25, 50, 75, 100] as const;
  return (
    <div className="mt-3 flex items-center gap-2">
      {presets.map((pct) => (
        <button
          key={pct}
          type="button"
          disabled={disabled || max <= 0n}
          onClick={() => onSelect(formatAmountInput((max * BigInt(pct)) / 100n))}
          className="flex-1 border border-white/10 py-1.5 text-[0.62rem] tracking-[0.12em] text-muted uppercase disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pct === 100 ? 'Max' : `${pct}%`}
        </button>
      ))}
      {onSettings ? (
        <button
          type="button"
          onClick={onSettings}
          className="shrink-0 p-1.5 text-muted hover:text-white"
          aria-label="Slippage settings"
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
      ) : null}
    </div>
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
  pendingLabel,
  confirmedLabel,
}: {
  pending: string | null;
  error: string | null;
  hash: string | null;
  network: NetworkConfig;
  pendingLabel?: string;
  confirmedLabel?: string;
}) {
  if (error) {
    return <p className="mt-2 text-sm text-accent">{error}</p>;
  }
  if (pending) {
    return <p className="mt-2 text-sm text-muted">{pendingLabel ?? 'Confirm in wallet…'}</p>;
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
          {confirmedLabel ?? 'Transaction confirmed'}
          <ExternalLink className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
        </a>
      </p>
    );
  }
  return null;
}
