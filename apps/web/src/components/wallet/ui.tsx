import { useEffect, useState, type ReactNode } from 'react';
import { Copy, ExternalLink, Wallet } from 'lucide-react';

export function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nether-overlay-title"
        className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-xl border border-white/10 bg-[#0c0c0c] p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="nether-overlay-title" className="font-display text-xl text-white">
            {title}
          </h2>
          <button
            type="button"
            className="text-muted hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[0.62rem] tracking-[0.18em] text-muted uppercase">{label}</p>
        <p className="mt-1 break-all font-mono text-sm text-white">{value}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {href ? (
          <a
            href={href}
            rel="noopener noreferrer"
            target="_blank"
            className="p-1 text-accent hover:text-white"
            aria-label={`${label} explorer`}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
          </a>
        ) : null}
        <button
          type="button"
          className="p-1 text-muted hover:text-white"
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          onClick={async () => {
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
      </div>
    </div>
  );
}

export function accentButtonClass(disabled: boolean, extra = ''): string {
  return [
    'w-full py-3 text-[0.72rem] tracking-[0.22em] text-white uppercase',
    disabled ? 'cursor-not-allowed bg-accent/50' : 'cursor-pointer bg-accent hover:bg-accent/90',
    extra,
  ].join(' ');
}

export function ConnectorIcon({ src, label }: { src?: string; label: string }) {
  if (src) {
    return <img src={src} alt="" className="h-8 w-8 rounded-md object-contain" />;
  }
  return <Wallet className="h-8 w-8 text-muted" strokeWidth={1.25} aria-label={label} />;
}
