import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { waitForChildExit } from '../local-dev-process';
import {
  closeServer,
  createTemporaryDirectory,
  invariant,
  listenOnLoopback,
  rootDirectory,
  waitForFile,
} from './runtime';
import { topologyEnvironment } from './workers';

const viteDevRunnerPath = path.join(rootDirectory, 'scripts', 'vite-dev-runner.ts');

async function stopRunner(runner: ChildProcess | undefined, signal: NodeJS.Signals) {
  if (runner?.exitCode === null && runner.signalCode === null) {
    const exitWait = { child: runner, label: 'Vite runner shutdown', timeoutMilliseconds: 10_000 };
    runner.kill(signal);
    try {
      await waitForChildExit(exitWait);
    } catch (error) {
      if (signal === 'SIGKILL') {
        throw error;
      }
      runner.kill('SIGKILL');
      await waitForChildExit(exitWait);
    }
  }
}

export async function proveOwnedViteReadiness() {
  const temporaryDirectory = createTemporaryDirectory('vite-readiness-');
  const readyFile = path.join(temporaryDirectory, 'vite-ready.json');
  const blocker = await listenOnLoopback(0);
  const address = blocker.address();
  invariant(address && typeof address !== 'string', 'The Vite readiness probe did not reserve a port');
  const port = address.port;
  let blockedRunner: ChildProcess | undefined;
  let runner: ChildProcess | undefined;

  try {
    blockedRunner = spawn(process.execPath, [viteDevRunnerPath, String(port), readyFile], {
      cwd: rootDirectory,
      env: topologyEnvironment(),
      stdio: 'pipe',
    });
    const blockedExit = await waitForChildExit({
      child: blockedRunner,
      label: 'Blocked Vite runner',
      timeoutMilliseconds: 10_000,
    });
    invariant(blockedExit.code !== 0, 'Vite accepted a port owned by another process');
    invariant(!existsSync(readyFile), 'A blocked Vite process wrote an ownership marker');
    await closeServer(blocker);

    runner = spawn(process.execPath, [viteDevRunnerPath, String(port), readyFile], {
      cwd: rootDirectory,
      env: topologyEnvironment(),
      stdio: 'pipe',
    });
    await waitForFile(readyFile);
    const marker = JSON.parse(readFileSync(readyFile, 'utf8')) as {
      pid?: unknown;
      port?: unknown;
    };
    invariant(marker.pid === runner.pid && marker.port === port, 'Vite wrote a marker for another process or port');
    const response = await fetch(`http://127.0.0.1:${port}/@vite/client`, {
      signal: AbortSignal.timeout(10_000),
    });
    invariant(response.ok, 'The marked Vite process did not answer on its owned port');

    console.log('Vite reports readiness only after its process owns the strict local port.');
  } finally {
    if (blocker.listening) {
      await closeServer(blocker);
    }
    await stopRunner(blockedRunner, 'SIGKILL');
    await stopRunner(runner, 'SIGTERM');
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
