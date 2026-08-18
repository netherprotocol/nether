import { useEffect, useState } from 'react';
import { ExternalLink, Menu, X } from 'lucide-react';
import { WalletProviders } from './wallet/WalletProviders.tsx';
import { NetworkSwitch } from './NetworkSwitch.tsx';
import { ConnectButton } from './wallet/ConnectButton.tsx';
import { SocialLinks } from './SocialLinks.tsx';

export function MobileChrome({
  learnHref,
  appHref,
  docsHref,
  githubHref,
  onLearn,
  onApp,
  onDocs,
  showConnect,
}: {
  learnHref: string;
  appHref: string;
  docsHref: string;
  githubHref: string;
  onLearn: boolean;
  onApp: boolean;
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
              <a href={learnHref} className={tabClass(onLearn)} aria-current={onLearn ? 'page' : undefined}>
                Learn
              </a>
              <a href={appHref} className={tabClass(onApp)} aria-current={onApp ? 'page' : undefined}>
                App
              </a>
              <a href={docsHref} className={tabClass(onDocs)} aria-current={onDocs ? 'page' : undefined}>
                Docs
              </a>
              <a
                href={githubHref}
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex items-center gap-1.5 text-sm tracking-[0.22em] text-white uppercase"
              >
                GitHub
                <ExternalLink className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <SocialLinks
                labeled
                className="flex flex-col gap-4"
                iconClass="h-3.5 w-3.5"
                linkClass="inline-flex items-center gap-1.5 text-sm tracking-[0.22em] text-white uppercase"
              />
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
