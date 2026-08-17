import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { WalletProviders } from './wallet/WalletProviders.tsx';
import { NetworkSwitch } from './NetworkSwitch.tsx';
import { ConnectButton } from './wallet/ConnectButton.tsx';

export function MobileChrome({
  graveHref,
  docsHref,
  sourceHref,
  onGrave,
  onDocs,
  showConnect,
}: {
  graveHref: string;
  docsHref: string;
  sourceHref: string;
  onGrave: boolean;
  onDocs: boolean;
  showConnect: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function tabClass(active: boolean): string {
    return active
      ? 'text-sm tracking-[0.22em] text-accent uppercase'
      : 'text-sm tracking-[0.22em] text-white uppercase';
  }

  return (
    <WalletProviders>
      <button
        type="button"
        className="relative z-[60] p-1 text-white md:hidden"
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="h-6 w-6" strokeWidth={1.5} /> : <Menu className="h-6 w-6" strokeWidth={1.5} />}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-[3.25rem] border-b border-white/10 bg-[#0c0c0c] px-5 py-6 md:top-[3.6rem]">
            <nav className="flex flex-col gap-4" aria-label="Primary">
              <a href={graveHref} className={tabClass(onGrave)} aria-current={onGrave ? 'page' : undefined}>
                Grave
              </a>
              <a href={docsHref} className={tabClass(onDocs)} aria-current={onDocs ? 'page' : undefined}>
                Docs
              </a>
              <a
                href={sourceHref}
                rel="noopener noreferrer"
                target="_blank"
                className="text-sm tracking-[0.22em] text-white uppercase"
              >
                Source
              </a>
            </nav>
            <div className="mt-6">
              <NetworkSwitch />
            </div>
            {showConnect ? (
              <div className="mt-4">
                <ConnectButton />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </WalletProviders>
  );
}
