import { BookOpen, Code2, Landmark } from 'lucide-react';
import { GITHUB_REPO_URL, withBase } from '../../lib/site.ts';
import { ConnectButton } from '../wallet/ConnectButton.tsx';

export function MobileDock() {
  const graveHref = withBase('grave');
  const docsHref = withBase('docs');
  const items = [
    { href: graveHref, label: 'Grave', icon: Landmark, current: true },
    { href: docsHref, label: 'Docs', icon: BookOpen, current: false },
    { href: GITHUB_REPO_URL, label: 'Source', icon: Code2, current: false, external: true },
  ] as const;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a0a]/95 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      aria-label="Mobile"
    >
      <div className="flex items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const className = [
            'flex min-w-[3.4rem] flex-col items-center gap-1 px-2 py-1 text-[0.55rem] tracking-[0.14em] uppercase',
            item.current ? 'text-accent' : 'text-muted',
          ].join(' ');
          if ('external' in item && item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                rel="noopener noreferrer"
                target="_blank"
                className={className}
              >
                <Icon className="h-5 w-5" strokeWidth={1.4} aria-hidden="true" />
                {item.label}
              </a>
            );
          }
          return (
            <a key={item.label} href={item.href} className={className} aria-current={item.current ? 'page' : undefined}>
              <Icon className="h-5 w-5" strokeWidth={1.4} aria-hidden="true" />
              {item.label}
            </a>
          );
        })}
        <div className="min-w-0 flex-1 pl-2">
          <ConnectButton variant="dock" />
        </div>
      </div>
    </nav>
  );
}
