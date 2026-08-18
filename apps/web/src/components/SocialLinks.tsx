import { DISCORD_URL, X_URL } from '../lib/site.ts';
import { SocialMark } from './SocialMark.tsx';

const ITEMS = [
  { name: 'discord' as const, href: DISCORD_URL, label: 'Discord' },
  { name: 'x' as const, href: X_URL, label: 'X' },
] as const;

export function SocialLinks({
  labeled = false,
  className,
  iconClass,
  linkClass,
}: {
  labeled?: boolean;
  className?: string;
  iconClass?: string;
  linkClass?: string;
}) {
  const markClass = iconClass ?? (labeled ? 'h-3.5 w-3.5' : 'h-4 w-4');
  const itemClass =
    linkClass ??
    (labeled
      ? 'inline-flex items-center gap-1.5 text-[0.65rem] font-normal tracking-[0.28em] text-white uppercase md:text-[0.7rem]'
      : 'inline-flex items-center justify-center p-1 text-paper/80 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent');

  return (
    <div role="group" aria-label="Social" className={className ?? 'flex items-center gap-3'}>
      {ITEMS.map((item) => (
        <a
          key={item.name}
          href={item.href}
          rel="noopener noreferrer"
          target="_blank"
          className={itemClass}
        >
          <SocialMark name={item.name} className={markClass} />
          {labeled ? item.label : null}
          <span className="sr-only">
            {labeled ? '(opens in a new tab)' : `${item.label} (opens in a new tab)`}
          </span>
        </a>
      ))}
    </div>
  );
}
