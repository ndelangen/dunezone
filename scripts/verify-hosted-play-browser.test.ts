import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'dunezone-play-browser-guard-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function run(origin: string, backend: string, privateMode = 0o600) {
  const envFile = path.join(directory, 'local.env');
  writeFileSync(envFile, `CONVEX_SELF_HOSTED_URL=${backend}\n`, { mode: privateMode });
  return spawnSync(
    'bun',
    [
      path.resolve('scripts/verify-hosted-play-browser.mjs'),
      '--origin',
      origin,
      '--env-file',
      envFile,
      '--credentials-file',
      path.join(directory, 'accounts.json'),
      '--report-dir',
      path.join(directory, 'reports'),
    ],
    { encoding: 'utf8', timeout: 10_000 }
  );
}

test.each([
  ['https://dune.zone', 'http://127.0.0.1:3210', '--origin'],
  ['http://127.0.0.1:8787', 'https://production.convex.cloud', 'CONVEX_SELF_HOSTED_URL'],
  ['http://127.0.0.1:8787/path', 'http://127.0.0.1:3210', '--origin'],
])('rejects non-isolated browser settings before opening a browser: %s', (origin, backend, label) => {
  const result = run(origin, backend);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`${label} must be an explicit http://127.0.0.1:PORT origin.`);
  expect(result.stdout).not.toContain('PASS');
});

test('refuses a readable-by-others private environment file', () => {
  const result = run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', 0o644);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Private files must not be symlinks or readable by others.');
  expect(result.stdout).not.toContain('PASS');
});
