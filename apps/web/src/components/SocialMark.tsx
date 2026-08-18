import { DISCORD_MARK_PATH, DISCORD_MARK_VIEWBOX, X_MARK_PATH, X_MARK_VIEWBOX } from '../lib/social.ts';

export function SocialMark({ name, className }: { name: 'discord' | 'x'; className?: string }) {
  const viewBox = name === 'discord' ? DISCORD_MARK_VIEWBOX : X_MARK_VIEWBOX;
  const path = name === 'discord' ? DISCORD_MARK_PATH : X_MARK_PATH;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
      aria-hidden="true"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
