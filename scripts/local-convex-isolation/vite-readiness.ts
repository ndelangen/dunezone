import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  closeServer,
  createTemporaryDirectory,
  invariant,
  listenOnLoopback,
  rootDirectory,
  waitForExit,
  waitForFile,
} from './runtime';
import { topologyEnvironment } from './workers';

const viteDevRunnerPath = path.join(rootDirectory, 'scripts', 'vite-dev-runner.ts');

async function stopRunner(runner: ChildProcess | undefined, signal: NodeJS.Signals) {
  if (runner?.exitCode === null && runner.signalCode === null) {
    runner.kill(signal);
    await waitForExit(runner);
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
    invariant((await waitForExit(blockedRunner)) !== 0, 'Vite accepted a port owned by another process');
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
    const response = await fetch(`http://127.0.0.1:${port}/@vite/client`);
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
