import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NETH_MARK_FILE, NETH_MARK_PATH, NETH_MARK_VIEWBOX, nethMarkUrl } from './nethMark.ts';

const publicSvg = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../public', NETH_MARK_FILE),
  'utf8',
);

describe('neth mark', () => {
  it('publishes the supplied path at a stable Pages URL', () => {
    assert.ok(publicSvg.includes(NETH_MARK_PATH));
    assert.ok(publicSvg.includes(`viewBox="${NETH_MARK_VIEWBOX}"`));
    assert.ok(publicSvg.includes('fill="#000000"'));
    assert.equal(nethMarkUrl(), 'https://rastsislaux.github.io/nether/neth.svg');
  });
});
