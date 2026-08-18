import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NETH_MARK_FILE } from './nethMark.ts';
import {
  SOCIAL_IMAGE_FILE,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  siteAssetUrl,
  socialImageUrl,
  withBase,
} from './site.ts';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../../public');
const layoutPath = join(here, '../layouts/Layout.astro');

describe('site assets', () => {
  it('publishes hero.png as the social preview image', () => {
    const file = join(publicDir, SOCIAL_IMAGE_FILE);
    assert.equal(existsSync(file), true, SOCIAL_IMAGE_FILE);
    const png = readFileSync(file);
    assert.equal(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
    assert.equal(png.readUInt32BE(16), SOCIAL_IMAGE_WIDTH);
    assert.equal(png.readUInt32BE(20), SOCIAL_IMAGE_HEIGHT);
    assert.equal(socialImageUrl(), 'https://netherprotocol.xyz/hero.png');
  });

  it('publishes the NETH mark as the favicon', () => {
    assert.equal(existsSync(join(publicDir, NETH_MARK_FILE)), true, NETH_MARK_FILE);
    assert.equal(siteAssetUrl(NETH_MARK_FILE), 'https://netherprotocol.xyz/neth.svg');
    assert.equal(withBase(NETH_MARK_FILE), '/neth.svg');
  });

  it('wires favicon and social image tags in the document head', () => {
    const layout = readFileSync(layoutPath, 'utf8');
    assert.ok(layout.includes('rel="icon"'));
    assert.ok(layout.includes('type="image/svg+xml"'));
    assert.ok(layout.includes('withBase(NETH_MARK_FILE)'));
    assert.ok(layout.includes('property="og:image"'));
    assert.ok(layout.includes('name="twitter:card"'));
    assert.ok(layout.includes('summary_large_image'));
    assert.ok(layout.includes('name="twitter:image"'));
    assert.ok(layout.includes('socialImageUrl()'));
  });
});
