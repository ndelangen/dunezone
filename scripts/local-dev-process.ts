import { spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { accessSync, constants as fsConstants, statSync } from 'node:fs';

export const PROCESS_INSPECTION_ENVIRONMENT: NodeJS.ProcessEnv = {
  ...process.env,
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
};

const processStatusExecutableCandidates = ['/bin/ps', '/usr/bin/ps'];

export type ProcessIdentity = {
  pid: number;
  startedAt: string;
};

type ProcessDescription = {
  pid: number;
  role: string;
};

type ChildProcessDescription = {
  child: ChildProcess;
  label: string;
};

type ChildProcessWait = ChildProcessDescription & {
  timeoutMilliseconds: number;
};

type ChildProcessExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

function isPositiveProcessId(pid: number) {
  return Number.isSafeInteger(pid) && pid > 0;
}

function executableIsRunnable(candidate: string) {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveProcessStatusExecutable() {
  const executable = processStatusExecutableCandidates.find(executableIsRunnable);
  if (!executable) {
    throw new Error('Could not find the ps executable');
  }
  return executable;
}

function processTargetIsLive(target: number) {
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

function failedProcessInspection(pid: number) {
  let exists: boolean;
  try {
    exists = processTargetIsLive(pid);
  } catch {
    throw new Error(`Could not verify local development process ${pid}`);
  }
  if (exists) {
    throw new Error(`Local development process ${pid} exists but ps could not inspect it`);
  }
  return undefined;
}

function readProcessStart(pid: number) {
  const result = spawnSync(resolveProcessStatusExecutable(), ['-p', String(pid), '-o', 'lstart='], {
    encoding: 'utf8',
    env: PROCESS_INSPECTION_ENVIRONMENT,
  });
  if (result.error) {
    throw new Error(`Could not inspect local development process ${pid}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    return failedProcessInspection(pid);
  }
  const identity = result.stdout.replace(/\s+/g, ' ').trim();
  if (!identity) {
    throw new Error(`Local development process ${pid} has no start identity`);
  }
  return identity;
}

function processStartIdentity(pid: number): string | undefined {
  return isPositiveProcessId(pid) ? readProcessStart(pid) : undefined;
}

export function requireProcessIdentity(description: ProcessDescription): ProcessIdentity {
  const startedAt = processStartIdentity(description.pid);
  if (!startedAt) {
    throw new Error(`Could not identify the local development ${description.role} process ${description.pid}`);
  }
  return { pid: description.pid, startedAt };
}

export function processIdentityIsLive(identity: ProcessIdentity) {
  return processStartIdentity(identity.pid) === identity.startedAt;
}

function configuredOwnerPid(environment: NodeJS.ProcessEnv) {
  const value = environment.LOCAL_DEV_OWNER_PID?.trim();
  if (!value) {
    return process.pid;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error('LOCAL_DEV_OWNER_PID must identify a running process');
  }
  const pid = Number(value);
  if (!isPositiveProcessId(pid)) {
    throw new Error('LOCAL_DEV_OWNER_PID must identify a running process');
  }
  return pid;
}

export function resolveReservationProcessIdentities(environment: NodeJS.ProcessEnv) {
  const owner = requireProcessIdentity({ pid: configuredOwnerPid(environment), role: 'owner' });
  const worker = process.pid === owner.pid ? owner : requireProcessIdentity({ pid: process.pid, role: 'worker' });
  return { owner, worker };
}

export async function waitForChildStart(description: ChildProcessDescription) {
  await new Promise<void>((resolve, reject) => {
    description.child.once('spawn', resolve);
    description.child.once('error', reject);
  });
  if (!description.child.pid) {
    throw new Error(`${description.label} has no process id`);
  }
  return description.child.pid;
}

export function waitForChildExit(wait: ChildProcessWait) {
  const { child, label, timeoutMilliseconds } = wait;
  return new Promise<ChildProcessExit>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const settle = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      child.off('error', onError);
      child.off('exit', onExit);
      complete();
    };
    const onError = (error: Error) => settle(() => reject(error));
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => settle(() => resolve({ code, signal }));
    child.once('error', onError);
    child.once('exit', onExit);
    timeout = setTimeout(
      () => settle(() => reject(new Error(`${label} did not finish within ${timeoutMilliseconds}ms`))),
      timeoutMilliseconds
    );
    if (child.exitCode !== null || child.signalCode !== null) {
      settle(() => resolve({ code: child.exitCode, signal: child.signalCode }));
    }
  });
}

export class CleanupFenceHeldError extends Error {}

export class CleanupProcessGroup {
  constructor(readonly id: number) {}

  isLive() {
    return processTargetIsLive(-this.id);
  }

  private async signalAndWait(signal: 'SIGTERM' | 'SIGKILL') {
    process.kill(-this.id, signal);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (!this.isLive()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  }

  async terminate() {
    if (!this.isLive()) {
      return;
    }
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      if (await this.signalAndWait(signal)) {
        return;
      }
    }
    throw new CleanupFenceHeldError(`Local Convex cleanup process group ${this.id} is still alive`);
  }

  async waitForDrain(deadline: number) {
    while (this.isLive()) {
      if (Date.now() >= deadline) {
        throw new Error(`Docker cleanup process group ${this.id} did not drain`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async holdFenceUntilDrained() {
    while (this.isLive()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
