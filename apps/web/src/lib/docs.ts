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

export function displayTitle(id: string, body: string | undefined): string {
  return firstHeading(body) ?? id;
}

export type DocEntry = {
  id: string;
  body?: string;
};

export type DocGroup = {
  label: string;
  entries: DocEntry[];
};

export function groupDocs(entries: DocEntry[]): DocGroup[] {
  const root: DocEntry[] = [];
  const ndr: DocEntry[] = [];
  const nip: DocEntry[] = [];
  const other: DocEntry[] = [];

  for (const entry of entries) {
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

  const byId = (a: DocEntry, b: DocEntry) => a.id.localeCompare(b.id);
  return [
    { label: 'Protocol', entries: root.sort(byId) },
    { label: 'NDRs', entries: ndr.sort(byId) },
    { label: 'NIPs', entries: nip.sort(byId) },
    { label: 'Other', entries: other.sort(byId) },
  ].filter((group) => group.entries.length > 0);
}
