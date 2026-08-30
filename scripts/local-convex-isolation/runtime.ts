import type { ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import path from 'node:path';

export const rootDirectory = path.resolve(import.meta.dirname, '../..');
export const isolationEntrypointPath = path.join(rootDirectory, 'scripts', 'test-local-convex-isolation.ts');

export const privateProbeRoot = path.join(rootDirectory, 'node_modules', '.cache', 'dunezone-local-convex-tests');

export function createTemporaryDirectory(prefix: string) {
  mkdirSync(privateProbeRoot, { recursive: true, mode: 0o700 });
  chmodSync(privateProbeRoot, 0o700);
  return mkdtempSync(path.join(privateProbeRoot, prefix));
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForFile(filePath: string, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      return;
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

export async function waitForExit(child: ChildProcess) {
  return await new Promise<number | null>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const onExit = (code: number | null) => resolve(code);
    child.once('error', onError);
    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) {
      child.off('error', onError);
      child.off('exit', onExit);
      resolve(child.exitCode);
    }
  });
}

export function listenOnLoopback(port: number) {
  const server = createServer();
  return new Promise<Server>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve(server));
  });
}

export function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function processTargetIsAlive(processTarget: number) {
  try {
    process.kill(processTarget, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

export function processIsAlive(pid: number) {
  return processTargetIsAlive(pid);
}

export function processGroupIsAlive(processGroupId: number) {
  return processTargetIsAlive(-processGroupId);
}

export async function waitForProcessToStop(isAlive: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!isAlive()) {
      return;
    }
    await delay(20);
  }
}

export async function terminateProcessGroup(processGroupId: number) {
  if (!processGroupIsAlive(processGroupId)) {
    return;
  }
  process.kill(-processGroupId, 'SIGTERM');
  await waitForProcessToStop(() => processGroupIsAlive(processGroupId));
  if (processGroupIsAlive(processGroupId)) {
    process.kill(-processGroupId, 'SIGKILL');
  }
}
