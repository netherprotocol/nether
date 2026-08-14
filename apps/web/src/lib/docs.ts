export function docIdToSlug(id: string): string {
  const parts = id.split('/').filter(Boolean);
  if (parts.at(-1) === 'README') {
    parts.pop();
  }
  return parts.map((part) => part.replaceAll('_', '-')).join('/');
}

export function firstHeading(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

const HIDDEN_DOC_IDS = new Set(['implementation_roadmap']);

const DISPLAY_TITLE_OVERRIDES: Record<string, string> = {
  'ndr/template': 'NDR Template',
};

function pinRank(id: string): number {
  if (id.endsWith('/README')) {
    return 0;
  }
  if (id.endsWith('/template')) {
    return 1;
  }
  return 2;
}

export function displayTitle(id: string, body: string | undefined): string {
  return DISPLAY_TITLE_OVERRIDES[id] ?? firstHeading(body) ?? id;
}

export type DocEntry = {
  id: string;
  body?: string;
};

export type DocGroup = {
  label: string;
  entries: DocEntry[];
};

function byPortalOrder(a: DocEntry, b: DocEntry): number {
  const pinned = pinRank(a.id) - pinRank(b.id);
  if (pinned !== 0) {
    return pinned;
  }
  return a.id.localeCompare(b.id);
}

export function groupDocs(entries: DocEntry[]): DocGroup[] {
  const root: DocEntry[] = [];
  const ndr: DocEntry[] = [];
  const nip: DocEntry[] = [];
  const other: DocEntry[] = [];

  for (const entry of entries) {
    if (HIDDEN_DOC_IDS.has(entry.id)) {
      continue;
    }
    if (entry.id.startsWith('ndr/')) {
      ndr.push(entry);
    } else if (entry.id.startsWith('nip/')) {
      nip.push(entry);
    } else if (!entry.id.includes('/')) {
      root.push(entry);
    } else {
      other.push(entry);
    }
  }

  return [
    { label: 'Protocol', entries: root.sort(byPortalOrder) },
    { label: 'NDRs', entries: ndr.sort(byPortalOrder) },
    { label: 'NIPs', entries: nip.sort(byPortalOrder) },
    { label: 'Other', entries: other.sort(byPortalOrder) },
  ].filter((group) => group.entries.length > 0);
}
