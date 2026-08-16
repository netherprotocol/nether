import { NETH_MARK_PATH, NETH_MARK_VIEWBOX } from '../lib/nethMark.ts';

export function NethMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={NETH_MARK_VIEWBOX}
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
      aria-hidden="true"
    >
      <path d={NETH_MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
