import { SITE_BASE, SITE_ORIGIN } from './site.ts';

export const NETH_MARK_VIEWBOX = '186 117 878 878';
export const NETH_MARK_PATH =
  'M 628 117 L 393 544 L 608 995 L 858 552 Z M 628 255 L 689 410 L 627 643 L 737 489 L 769 551 L 611 843 L 476 546 Z';
export const NETH_MARK_FILE = 'neth.svg';

function envString(key: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const value = env?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function nethMarkUrl(): string {
  const originRaw = envString('SITE') ?? SITE_ORIGIN;
  const origin = originRaw.endsWith('/') ? originRaw : `${originRaw}/`;
  const baseRaw = envString('BASE_URL') ?? SITE_BASE;
  const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
  return new URL(`${base}${NETH_MARK_FILE}`, origin).href;
}
