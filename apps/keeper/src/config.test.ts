import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ConfigError, loadConfig, resolveGasLogPath } from './config.js';

const GRAVE = `0x${'11'.repeat(20)}`;
const REAPER = `0x${'22'.repeat(20)}`;
const KEY = `0x${'ab'.repeat(32)}`;

function required(extra: string[] = [], env: Record<string, string | undefined> = {}) {
  return loadConfig(
    ['--rpc-url', 'http://127.0.0.1:8545', '--chain-id', '8453', '--grave', GRAVE, '--reaper', REAPER, ...extra],
    env,
  );
}

describe('loadConfig', () => {
  it('throws when RPC is missing', () => {
    assert.throws(
      () => loadConfig(['--chain-id', '8453', '--grave', GRAVE, '--reaper', REAPER, '--dry-run'], {}),
      ConfigError,
    );
  });

  it('throws when addresses are missing', () => {
    assert.throws(() => loadConfig(['--rpc-url', 'http://127.0.0.1:8545', '--chain-id', '8453', '--dry-run'], {}), (err) => {
      return err instanceof ConfigError && err.message.includes('grave');
    });
  });

  it('throws when chain id is missing', () => {
    assert.throws(
      () => loadConfig(['--rpc-url', 'http://127.0.0.1:8545', '--grave', GRAVE, '--reaper', REAPER, '--dry-run'], {}),
      ConfigError,
    );
  });

  it('allows dry-run without a key', () => {
    const config = loadConfig(
      ['--rpc-url', 'http://127.0.0.1:8545', '--chain-id', 'base', '--grave', GRAVE, '--reaper', REAPER, '--dry-run'],
      {},
    );
    assert.equal(config.dryRun, true);
    assert.equal(config.privateKey, undefined);
    assert.equal(config.mode, 'once');
    assert.equal(config.chainId, 8453);
  });

  it('rejects websocket RPC URLs', () => {
    assert.throws(
      () =>
        loadConfig(
          ['--rpc-url', 'ws://127.0.0.1:8545', '--chain-id', '8453', '--grave', GRAVE, '--reaper', REAPER, '--dry-run'],
          {},
        ),
      ConfigError,
    );
  });

  it('requires a key when not dry-run', () => {
    assert.throws(() => required(), ConfigError);
  });

  it('accepts a key from env', () => {
    const config = loadConfig(
      ['--rpc-url', 'http://127.0.0.1:8545', '--chain-id', '84532', '--grave', GRAVE, '--reaper', REAPER],
      { NETHER_PRIVATE_KEY: KEY },
    );
    assert.equal(config.privateKey, KEY);
    assert.equal(config.chainId, 84532);
  });
});

describe('resolveGasLogPath', () => {
  it('opens a log path built from mixed separators', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nether-keeper-cfg-'));
    const resolved = resolveGasLogPath('logs\\nested/file.jsonl', dir);
    assert.equal(resolved, path.join(dir, 'logs', 'nested', 'file.jsonl'));
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, '{"sent":false}\n', 'utf8');
    assert.equal(fs.existsSync(resolved), true);
  });
});
