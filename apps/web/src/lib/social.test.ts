import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DISCORD_URL, X_URL } from './site.ts';
import {
  DISCORD_MARK_FILE,
  DISCORD_MARK_PATH,
  DISCORD_MARK_VIEWBOX,
  X_MARK_FILE,
  X_MARK_PATH,
  X_MARK_VIEWBOX,
} from './social.ts';

describe('social links', () => {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../public');

  it('points at Nether Discord and X accounts', () => {
    assert.equal(DISCORD_URL, 'https://discord.gg/N9mTHr5VE');
    assert.equal(X_URL, 'https://x.com/netherprotocol');
  });

  it('publishes unmodified Discord and X marks', () => {
    for (const [file, path, viewBox] of [
      [DISCORD_MARK_FILE, DISCORD_MARK_PATH, DISCORD_MARK_VIEWBOX],
      [X_MARK_FILE, X_MARK_PATH, X_MARK_VIEWBOX],
    ] as const) {
      assert.equal(existsSync(join(publicDir, file)), true, file);
      const svg = readFileSync(join(publicDir, file), 'utf8');
      assert.ok(svg.includes(path));
      assert.ok(svg.includes(`viewBox="${viewBox}"`));
      assert.ok(svg.includes('fill="#000000"'));
    }
  });
});
