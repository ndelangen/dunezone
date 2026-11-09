import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vite-plus/test';

import { verifyProcess } from './verify-hosted-process';

const root = path.resolve(import.meta.dirname, '..');
const directories: string[] = [];
/* Child startup, process completion and the shell summary each need time on a loaded runner. */
const testOptions = { timeout: 45_000 };

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function evidence() {
  const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-verifier-result-'));
  directories.push(directory);
  const output = path.join(directory, 'test-results/hosted-play');
  const report = path.join(output, 'browser/battles-1/report.json');
  mkdirSync(path.dirname(report), { recursive: true });
  mkdirSync(path.join(directory, 'scripts'));
  copyFileSync(
    path.join(root, 'scripts/verify-hosted-flows.ts'),
    path.join(directory, 'scripts/verify-hosted-flows.ts')
  );
  return { directory, report, log: path.join(output, 'battles.log') };
}

async function runChild(mode: '0' | '23' | 'wait', failure?: object) {
  const files = evidence();
  const descriptor = openSync(files.log, 'w');
  const report = {
    flow: 'battles',
    startedAt: '2026-11-09T08:15:26.875Z',
    finishedAt: '2026-11-09T08:23:26.153Z',
    checks: [{ name: 'Battle assertions passed', elapsedSeconds: 476.4 }],
    milestones: { play: 83.1 },
    renderer: { kind: 'webgl2-swiftshader' },
    chromium: { build: 'full' },
    ...(failure ? { failure } : {}),
  };
  const child = spawn(
    process.execPath,
    [
      '-e',
      `require('node:fs').writeFileSync(process.argv[1], process.argv[2]);
console.log('REPORT ' + process.argv[1]);
process.on('SIGTERM', () => process.exit(0));
process.once('message', () => {
  if (process.argv[3] === 'wait') setInterval(() => {}, 1000);
  else process.exit(Number(process.argv[3]));
});
process.send('ready');`,
      files.report,
      JSON.stringify(report),
      mode,
    ],
    { stdio: ['ignore', descriptor, descriptor, 'ipc'] }
  );
  try {
    /* Wait for the report and signal handler before testing the short deadline; startup gets its own busy-runner bound. */
    await once(child, 'message', { signal: AbortSignal.timeout(15_000) });
    const verification = verifyProcess(child, files.log, mode === 'wait' ? 1000 : 15_000);
    child.send('go');
    const result = await verification;
    return { ...files, result, report: JSON.parse(readFileSync(files.report, 'utf8')) };
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    closeSync(descriptor);
  }
}

function summary(directory: string) {
  const result = spawnSync('bash', [path.join(root, '.github/actions/hosted-play-summary/summary.sh')], {
    cwd: directory,
    env: {
      ...process.env,
      HEADING: 'catalogue',
      SHARD: 'catalogue',
      PROTOCOL_VERIFIER: 'false',
      GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'),
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

test('a clean report followed by a late zero exit remains a process timeout in the summary', testOptions, async () => {
  const run = await runChild('wait');
  expect(run.result).toMatchObject({ status: 'timed_out', exitCode: 0 });
  expect(run.report.failure).toMatchObject({ name: 'VerifierTimeout', afterCheck: 'Battle assertions passed' });
  const output = summary(run.directory);
  expect(output).toContain('| battles | fail |');
  expect(output).toContain('did not exit within its 1 s process limit');
});

test('a zero exit keeps a clean browser report successful', testOptions, async () => {
  const run = await runChild('0');
  expect(run.result.status).toBe('passed');
  expect(run.report.failure).toBeUndefined();
  expect(summary(run.directory)).toContain('| battles | pass |');
});

test('a nonzero exit cannot leave a clean browser report successful', testOptions, async () => {
  const run = await runChild('23');
  expect(run.result).toMatchObject({ status: 'failed', exitCode: 23 });
  expect(run.report.failure.name).toBe('VerifierExit');
  expect(summary(run.directory)).toContain('| battles | fail |');
});

test('a process failure preserves the browser failure that preceded it', testOptions, async () => {
  const failure = { name: 'AssertionError', message: 'The battle remained active.', afterCheck: 'Battle started' };
  const run = await runChild('23', failure);
  expect(run.report.failure).toEqual(failure);
});

test('a timeout remains visible alongside an existing browser failure', testOptions, async () => {
  const failure = { name: 'AssertionError', message: 'The battle remained active.', afterCheck: 'Battle started' };
  const run = await runChild('wait', failure);
  expect(run.result.status).toBe('timed_out');
  expect(run.report.failure).toMatchObject({ name: failure.name, afterCheck: failure.afterCheck });
  const output = summary(run.directory);
  expect(output).toContain('did not exit within its 1 s process limit');
  expect(output).toContain(failure.message);
});

test('a log without a report cannot reuse a previous run report', testOptions, async () => {
  const run = await runChild('0');
  writeFileSync(run.log, 'Browser startup failed\n');
  expect(summary(run.directory)).toContain('| battles | no report |');
});
