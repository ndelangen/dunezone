import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

/*
 * scripts/lib/isolated-stack.test.ts and scripts/play-load/hosted-paths.test.ts cover the loopback and private-file rules.
 * These cases show that each input passes through them before a browser opens, and hold the report directory rule, which stays in the script.
 */

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
  options: { envFile?: string; credentialsFile?: string; reportDirectory?: string } = {}
) {
  const envFile = path.join(directory, 'local.env');
  writeFileSync(envFile, `CONVEX_SELF_HOSTED_URL=${backend}\n`, { mode: 0o600 });
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
      '--ruleset-id',
      'synthetic-ruleset',
    ],
    { encoding: 'utf8', timeout: 10_000 }
  );
}

function assertRefused(result: ReturnType<typeof run>, message: string) {
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(message);
  expect(result.stdout).not.toContain('CHROMIUM');
}

test.each([
  ['--origin', 'https://dune.zone', 'http://127.0.0.1:3210'],
  ['CONVEX_SELF_HOSTED_URL', 'http://127.0.0.1:8787', 'https://production.convex.cloud'],
])('refuses a remote %s before opening a browser', (label, origin, backend) => {
  assertRefused(run(origin, backend), `${label} must be an explicit http://127.0.0.1:PORT origin.`);
});

test('refuses an environment file outside the temporary directory', () => {
  assertRefused(
    run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', {
      envFile: path.join(path.parse(tmpdir()).root, 'dunezone-private', 'local.env'),
    }),
    'Hosted files must stay in the operating system temporary directory.'
  );
});

test('refuses credentials reached through a symlinked parent directory', () => {
  const alias = path.join(directory, 'private-alias');
  symlinkSync(directory, alias, 'dir');
  assertRefused(
    run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', { credentialsFile: path.join(alias, 'accounts.json') }),
    'Hosted files need a private parent directory.'
  );
});

test('keeps private files outside a report directory resolved through a symlink', () => {
  const alias = path.join(directory, 'report-alias');
  symlinkSync(directory, alias, 'dir');
  assertRefused(
    run('http://127.0.0.1:8787', 'http://127.0.0.1:3210', { reportDirectory: alias }),
    'Private files must stay outside the report directory.'
  );
});
