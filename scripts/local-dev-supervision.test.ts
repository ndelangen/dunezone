import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const fixtures = path.join(import.meta.dirname, 'local-dev-supervision-fixtures');
const realBun = execFileSync('which', ['bun'], { encoding: 'utf8' }).trim();

function startLauncher(mode: 'blocking' | 'failure') {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-dev-supervision-'));
  for (const name of ['bun', 'docker']) {
    copyFileSync(path.join(fixtures, name), path.join(directory, name));
    chmodSync(path.join(directory, name), 0o700);
  }
  const launcher = spawn('/bin/bash', [path.join(import.meta.dirname, 'app-dev.sh'), '--local'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      LOCAL_DEV_DOCKER_PATH: path.join(directory, 'docker'),
      TEST_DIRECTORY: directory,
      TEST_REAL_BUN: realBun,
      TEST_WORKER_FIXTURE: fileURLToPath(new URL('./local-dev-supervision-fixtures/worker.ts', import.meta.url)),
      TEST_MODE: mode,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  launcher.stdout.on('data', (data) => {
    output += data;
  });
  launcher.stderr.on('data', (data) => {
    output += data;
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    launcher.once('error', reject);
    launcher.once('exit', resolve);
  });
  const metadataFile = path.join(directory, 'launch.json');
  const metadata = () =>
    JSON.parse(readFileSync(metadataFile, 'utf8')) as {
      project: string;
      temporaryDirectory: string;
      workerPid: number;
    };
  return {
    directory,
    launcher,
    exited,
    metadata,
    output: () => output,
    async dispose() {
      launcher.kill('SIGKILL');
      if (existsSync(metadataFile)) {
        const launch = metadata();
        try {
          process.kill(-launch.workerPid, 'SIGKILL');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            throw error;
          }
        }
        rmSync(launch.temporaryDirectory, { recursive: true, force: true });
      }
      await exited;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function expectCleanup(launch: ReturnType<typeof startLauncher>) {
  expect(existsSync(launch.metadata().temporaryDirectory)).toBe(false);
  const [project, command] = readFileSync(path.join(launch.directory, 'docker.log'), 'utf8').trim().split('\n');
  expect(project).toBe(launch.metadata().project);
  expect(command).toMatch(/down -v --remove-orphans$/u);
}

test('TERM drains blocking provisioning, removes private files, and cleans only its project', async () => {
  const launch = startLauncher('blocking');
  try {
    const childFile = path.join(launch.directory, 'child-pid');
    await expect.poll(() => existsSync(childFile), { timeout: 5000 }).toBe(true);
    const childPid = Number(readFileSync(childFile, 'utf8'));
    launch.launcher.kill('SIGTERM');
    expect(await launch.exited, launch.output()).toBe(143);
    await expect
      .poll(
        () => {
          try {
            process.kill(childPid, 0);
            return true;
          } catch {
            return false;
          }
        },
        { timeout: 3000 }
      )
      .toBe(false);
    expectCleanup(launch);
  } finally {
    await launch.dispose();
  }
}, 15_000);

test('a provisioning failure keeps its exit code after project cleanup', async () => {
  const launch = startLauncher('failure');
  try {
    expect(await launch.exited, launch.output()).toBe(23);
    expectCleanup(launch);
  } finally {
    await launch.dispose();
  }
}, 10_000);
