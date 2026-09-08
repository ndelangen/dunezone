import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

function run(
  origin: string,
  backend: string,
  options: { privateMode?: number; envFile?: string; credentialsFile?: string; reportDirectory?: string } = {}
) {
  const envFile = path.join(directory, 'local.env');
  writeFileSync(envFile, `CONVEX_SELF_HOSTED_URL=${backend}\n`, { mode: options.privateMode ?? 0o600 });
  return spawnSync(
    'bun',
    [
      path.resolve('scripts/verify-hosted-play-browser.mjs'),
      '--origin',
      origin,
      '--env-file',
      options.envFile ?? envFile,
      '--credentials-file',
      options.credentialsFile ?? path.join(directory, 'accounts.json'),
      '--report-dir',
      options.reportDirectory ?? path.join(directory, 'reports'),
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
  const result = run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', { privateMode: 0o644 });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Private files must not be symlinks or readable by others.');
  expect(result.stdout).not.toContain('PASS');
});

test('rejects parent traversal before reading a private file', () => {
  const result = run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', {
    envFile: `${directory}/missing/../local.env`,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Private file paths must not contain parent traversal.');
  expect(result.stdout).not.toContain('PASS');
});

test('rejects a symlink to a private environment file', () => {
  const alias = path.join(directory, 'alias.env');
  symlinkSync(path.join(directory, 'local.env'), alias);
  const result = run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', { envFile: alias });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Private files must not be symlinks or readable by others.');
  expect(result.stdout).not.toContain('PASS');
});

test('rejects credentials reached through a symlinked parent directory', () => {
  const alias = path.join(directory, 'private-alias');
  symlinkSync(directory, alias, 'dir');
  const result = run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', {
    credentialsFile: path.join(alias, 'accounts.json'),
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Private files need a private parent directory.');
  expect(result.stdout).not.toContain('PASS');
});

test('keeps private files outside a report directory resolved through a symlink', () => {
  const alias = path.join(directory, 'report-alias');
  symlinkSync(directory, alias, 'dir');
  const result = run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', { reportDirectory: alias });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Private files must stay outside the report directory.');
  expect(result.stdout).not.toContain('PASS');
});
