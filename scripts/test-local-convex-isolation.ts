import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { recordLocalDevelopmentCleanup } from './local-dev-cleanup';
import { createLocalDevelopmentInstance, localDevelopmentEnvironmentOverrides } from './local-dev-instance';
import {
  backendUp,
  commandEnvironment,
  localApplicationEnvironment,
  resolveDockerExecutable,
  selfHostedEnvironment,
} from './provision';
import type { SelfHostedDeployment } from './provision';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const cleanupScript = path.join(import.meta.dirname, 'local-dev-cleanup.ts');
const baseEnvironment = localApplicationEnvironment(process.env);

function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    env: environment,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${path.basename(command)} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr.slice(-4000)}`
    );
  }
  return result.stdout.trim();
}

function createStack(overrides: NodeJS.ProcessEnv = {}) {
  const instance = createLocalDevelopmentInstance(overrides);
  const environment = commandEnvironment(baseEnvironment, localDevelopmentEnvironmentOverrides(instance));
  const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-isolation-'));
  recordLocalDevelopmentCleanup(directory, environment);
  return { instance, environment, directory };
}

type Stack = ReturnType<typeof createStack>;

function resources(stack: Stack) {
  const docker = resolveDockerExecutable(stack.environment);
  const label = `label=com.docker.compose.project=${stack.instance.composeProjectName}`;
  return {
    containers: run(docker, ['ps', '-aq', '--filter', label], stack.environment),
    networks: run(docker, ['network', 'ls', '-q', '--filter', label], stack.environment),
    volumes: run(docker, ['volume', 'ls', '-q', '--filter', label], stack.environment),
  };
}

function cleanStack(stack: Stack) {
  run(process.execPath, ['--no-env-file', cleanupScript], {
    ...baseEnvironment,
    LOCAL_DEV_TEMPORARY_DIRECTORY: stack.directory,
  });
  assert(
    Object.values(resources(stack)).every((value) => value === ''),
    'Cleanup left resources in its own project'
  );
}

async function assertHealthy(stack: Stack) {
  const response = await fetch(`${stack.instance.backendUrl}/version`, { signal: AbortSignal.timeout(5000) });
  assert(response.ok, 'The surviving backend stopped answering');
}

function convex(stack: Stack, deployment: SelfHostedDeployment, args: string[]) {
  assert.equal(new URL(deployment.url).hostname, '127.0.0.1', 'The proof only accepts a loopback deployment');
  return run(
    process.execPath,
    ['--no-env-file', 'x', 'convex', ...args],
    selfHostedEnvironment(stack.environment, deployment)
  );
}

function seedOwnRow(stack: Stack, deployment: SelfHostedDeployment) {
  const file = path.join(stack.directory, 'row.jsonl');
  writeFileSync(file, `${JSON.stringify({ owner: stack.instance.composeProjectName })}\n`, { mode: 0o600 });
  convex(stack, deployment, ['import', '--table', 'isolation_probe', '--replace', '-y', file]);
}

function assertOwnRow(stack: Stack, deployment: SelfHostedDeployment) {
  const rows = JSON.parse(convex(stack, deployment, ['data', 'isolation_probe', '--format', 'json', '--limit', '2']));
  assert.equal(rows.length, 1, 'The isolated database has an unexpected row count');
  assert.equal(rows[0].owner, stack.instance.composeProjectName, "The database contains another launch's row");
}

async function proveDockerIsolation() {
  const stacks: Stack[] = [];
  const failures: unknown[] = [];
  try {
    const first = createStack();
    stacks.push(first);
    /* Keep this proof's random candidates apart; other occupied ports still fail startup. */
    const second = createStack({
      APP_DEV_PORT: String(first.instance.appPort + 4),
      CONVEX_BACKEND_PORT: String(first.instance.backendPort + 4),
      CONVEX_SITE_PORT: String(first.instance.sitePort + 4),
      CONVEX_DASHBOARD_PORT: String(first.instance.dashboardPort + 4),
    });
    stacks.push(second);
    const [firstResult, secondResult] = await Promise.allSettled([
      backendUp(first.environment, { url: first.instance.backendUrl }),
      backendUp(second.environment, { url: second.instance.backendUrl }),
    ]);
    if (firstResult.status === 'rejected') {
      throw firstResult.reason;
    }
    if (secondResult.status === 'rejected') {
      throw secondResult.reason;
    }
    const firstDeployment = firstResult.value;
    const secondDeployment = secondResult.value;
    assert.notEqual(first.instance.composeProjectName, second.instance.composeProjectName);
    const firstResources = resources(first);
    const secondResources = resources(second);
    for (const resource of ['containers', 'networks', 'volumes'] as const) {
      assert(firstResources[resource] && secondResources[resource], `Both stacks need their own ${resource}`);
      const firstIds = new Set(firstResources[resource].split('\n'));
      assert(
        secondResources[resource].split('\n').every((id) => !firstIds.has(id)),
        `The stacks share ${resource}`
      );
    }
    seedOwnRow(first, firstDeployment);
    seedOwnRow(second, secondDeployment);
    assertOwnRow(first, firstDeployment);
    assertOwnRow(second, secondDeployment);

    cleanStack(first);
    await assertHealthy(second);
    assertOwnRow(second, secondDeployment);

    const blocked = createStack({
      APP_DEV_PORT: String(first.instance.appPort),
      CONVEX_BACKEND_PORT: String(second.instance.backendPort),
      CONVEX_SITE_PORT: String(first.instance.sitePort),
      CONVEX_DASHBOARD_PORT: String(first.instance.dashboardPort),
    });
    stacks.push(blocked);
    await assert.rejects(backendUp(blocked.environment, { url: blocked.instance.backendUrl }));
    cleanStack(blocked);
    await assertHealthy(second);
    assertOwnRow(second, secondDeployment);
    assert.deepEqual(resources(second), secondResources, 'Peer cleanup replaced or removed the surviving resources');
    console.log(
      'Two local databases keep separate resources and rows through peer cleanup and an occupied-port failure.'
    );
  } catch (error) {
    failures.push(error);
  } finally {
    for (const stack of stacks) {
      try {
        cleanStack(stack);
      } catch (error) {
        failures.push(error);
        console.error(`Manual cleanup: bun --no-env-file ${cleanupScript} ${stack.instance.composeProjectName}`);
      }
      rmSync(stack.directory, { recursive: true, force: true });
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Local Docker isolation failed');
  }
}

async function within<T>(operation: Promise<T>, label: string, milliseconds = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function proveOwnedViteReadiness() {
  const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-vite-proof-'));
  const marker = path.join(directory, 'ready.json');
  const blocker = createServer();
  const runners: ReturnType<typeof Bun.spawn>[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(0, '127.0.0.1', resolve);
    });
    const address = blocker.address();
    assert(address && typeof address !== 'string');
    const start = () => {
      const runner = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          path.join(import.meta.dirname, 'vite-dev-runner.ts'),
          String(address.port),
          marker,
        ],
        {
          cwd: rootDirectory,
          env: { ...baseEnvironment, VITE_CONVEX_URL: 'http://127.0.0.1:3210' },
          stdout: 'ignore',
          stderr: 'inherit',
        }
      );
      runners.push(runner);
      return runner;
    };
    const blocked = start();
    assert.notEqual(await within(blocked.exited, 'Occupied-port Vite startup'), 0);
    assert(!existsSync(marker), 'Vite announced readiness without owning its port');
    await new Promise<void>((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));

    const running = start();
    await within(
      (async () => {
        while (!existsSync(marker)) {
          assert.equal(running.exitCode, null, 'Vite exited before owning its port');
          await Bun.sleep(100);
        }
      })(),
      'Vite readiness'
    );
    const ready = JSON.parse(readFileSync(marker, 'utf8'));
    assert.equal(ready.pid, running.pid);
    assert.equal(ready.port, address.port);
    assert((await fetch(`http://127.0.0.1:${address.port}/@vite/client`, { signal: AbortSignal.timeout(5000) })).ok);
    console.log('Vite announces readiness only after its own process binds the requested port.');
  } finally {
    if (blocker.listening) {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
    for (const runner of runners) {
      if (runner.exitCode === null) {
        runner.kill('SIGTERM');
        try {
          await within(runner.exited, 'Vite shutdown', 5000);
        } catch {
          runner.kill('SIGKILL');
          await within(runner.exited, 'Vite forced shutdown', 5000);
        }
      }
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  assert.equal(process.argv.length, 2, 'The isolation proof takes no arguments');
  await proveOwnedViteReadiness();
  await proveDockerIsolation();
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
