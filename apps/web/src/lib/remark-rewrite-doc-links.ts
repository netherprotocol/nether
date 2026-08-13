import path from 'node:path';
import { SITE_BASE } from './site';
import { docIdToSlug } from './docs';

type MdNode = {
  type: string;
  url?: string;
  children?: MdNode[];
};

function walk(node: MdNode, visit: (node: MdNode) => void): void {
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
}

function docsHrefFromRel(relPosix: string): string {
  const slug = docIdToSlug(relPosix.replace(/\.md$/i, ''));
  const prefix = SITE_BASE.endsWith('/') ? SITE_BASE : `${SITE_BASE}/`;
  return slug ? `${prefix}docs/${slug}` : `${prefix}docs`;
}

export function remarkRewriteDocLinks() {
  return (tree: MdNode, file: { cwd?: string; path?: string; history?: string[] }) => {
    const filePath = file.path ?? file.history?.[0];
    if (!filePath) {
      return;
    }

    const cwd = file.cwd ?? process.cwd();
    const docsRoot = path.resolve(cwd, '../../docs');

    walk(tree, (node) => {
      if (node.type !== 'link' || !node.url) {
        return;
      }

      const raw = node.url;
      if (
        raw.startsWith('http://') ||
        raw.startsWith('https://') ||
        raw.startsWith('mailto:') ||
        raw.startsWith('#')
      ) {
        return;
      }

      const [pathname, hash] = raw.split('#');
      if (!pathname.endsWith('.md')) {
        return;
      }

      const resolved = path.resolve(path.dirname(filePath), pathname);
      const rel = path.relative(docsRoot, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return;
      }

      const href = docsHrefFromRel(rel.split(path.sep).join('/'));
      node.url = hash ? `${href}#${hash}` : href;
    });
  };
}
