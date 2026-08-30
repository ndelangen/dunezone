import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

import { localDevelopmentEnvironmentOverrides } from '../local-dev-instance';
import {
  readLocalDevelopmentInstanceReservation,
  reserveLocalDevelopmentInstance,
  stopLocalDevelopmentInstance,
} from '../local-dev-reservation';
import type { ReservedLocalDevelopmentInstance } from '../local-dev-reservation';
import { backendUp, commandEnvironment, composeDown, resolveDockerExecutable } from '../provision';
import { createTemporaryDirectory, invariant, rootDirectory } from './runtime';
import { topologyEnvironment } from './workers';

type DockerProofFailure = { label: string; error: unknown };

type DockerProofStack = {
  label: string;
  reservationEnvironment: NodeJS.ProcessEnv;
  instance?: ReservedLocalDevelopmentInstance;
  environment?: NodeJS.ProcessEnv;
  undeclaredVolumeName?: string;
  stoppedThroughReservation: boolean;
};

type DockerProofFixture = {
  baseEnvironment: NodeJS.ProcessEnv;
  temporaryDirectory: string;
  reservationDirectory: string;
  stacks: [DockerProofStack, DockerProofStack];
};

function createDockerProofFixture(): DockerProofFixture {
  const baseEnvironment = topologyEnvironment();
  const temporaryDirectory = createTemporaryDirectory('docker-isolation-');
  const instanceSalt = path.basename(temporaryDirectory);
  const createStack = (label: string, suffix: string): DockerProofStack => ({
    label,
    reservationEnvironment: commandEnvironment(baseEnvironment, {
      LOCAL_DEV_INSTANCE_ID: `${instanceSalt}-${suffix}`,
    }),
    stoppedThroughReservation: false,
  });
  return {
    baseEnvironment,
    temporaryDirectory,
    reservationDirectory: path.join(temporaryDirectory, 'reservations'),
    stacks: [createStack('First stack', 'first'), createStack('Second stack', 'second')],
  };
}

function assertLoopback(url: string) {
  if (new URL(url).hostname !== '127.0.0.1') {
    throw new Error(`Isolation test refuses non-loopback backend URL ${url}`);
  }
}

async function assertHealthy(url: string) {
  const response = await fetch(`${url}/version`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Local Convex health check failed at ${url}`);
  }
}

async function assertStopped(url: string) {
  try {
    await fetch(`${url}/version`, { signal: AbortSignal.timeout(1000) });
  } catch {
    return;
  }
  throw new Error(`Stopped local Convex instance still answers at ${url}`);
}

function runDockerProofCommand(args: string[], environment: NodeJS.ProcessEnv) {
  const executable = resolveDockerExecutable(environment);
  const result = spawnSync(executable, args, {
    cwd: rootDirectory,
    encoding: 'utf8',
    env: environment,
  });
  if (result.error) {
    throw new Error(`Could not run Docker ${args.join(' ')}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = result.stderr.trim();
    throw new Error(`Docker ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }
  return result.stdout;
}

function dockerProjectResourceIds(
  resource: 'container' | 'network' | 'volume',
  projectName: string,
  environment: NodeJS.ProcessEnv
) {
  const listArgs = resource === 'container' ? ['ps', '-a'] : [resource, 'ls'];
  const outputFormat = resource === 'volume' ? '{{.Name}}' : '{{.ID}}';
  return runDockerProofCommand(
    [...listArgs, '--filter', `label=com.docker.compose.project=${projectName}`, '--format', outputFormat],
    environment
  )
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function requireStackReservation(stack: DockerProofStack) {
  invariant(stack.instance, `${stack.label} has no reservation`);
  return stack.instance;
}

function requireStackEnvironment(stack: DockerProofStack) {
  invariant(stack.environment, `${stack.label} has no Docker environment`);
  return stack.environment;
}

function createUndeclaredProjectVolume(stack: DockerProofStack) {
  const instance = requireStackReservation(stack);
  const environment = requireStackEnvironment(stack);
  const volumeName = `${instance.composeProjectName}-undeclared-cleanup-proof`;
  runDockerProofCommand(
    ['volume', 'create', '--label', `com.docker.compose.project=${instance.composeProjectName}`, volumeName],
    environment
  );
  return volumeName;
}

function assertReservedCleanupComplete(stack: DockerProofStack, reservationDirectory: string) {
  const instance = requireStackReservation(stack);
  invariant(
    !readLocalDevelopmentInstanceReservation(rootDirectory, stack.reservationEnvironment, reservationDirectory),
    `${stack.label} reservation remained after cleanup`
  );
  const environment = requireStackEnvironment(stack);
  for (const resource of ['container', 'network', 'volume'] as const) {
    const resourceIds = dockerProjectResourceIds(resource, instance.composeProjectName, environment);
    invariant(resourceIds.length === 0, `${stack.label} left Docker ${resource} resources after cleanup`);
  }
}

async function reserveDockerProofStack(stack: DockerProofStack, fixture: DockerProofFixture) {
  stack.instance = await reserveLocalDevelopmentInstance(
    rootDirectory,
    stack.reservationEnvironment,
    fixture.reservationDirectory
  );
  stack.environment = commandEnvironment(fixture.baseEnvironment, localDevelopmentEnvironmentOverrides(stack.instance));
  assertLoopback(stack.instance.backendUrl);
}

async function exerciseDockerIsolation(fixture: DockerProofFixture) {
  const [first, second] = fixture.stacks;
  await reserveDockerProofStack(first, fixture);
  await reserveDockerProofStack(second, fixture);
  const firstInstance = requireStackReservation(first);
  const secondInstance = requireStackReservation(second);

  await backendUp(requireStackEnvironment(first), { url: firstInstance.backendUrl });
  await backendUp(requireStackEnvironment(second), { url: secondInstance.backendUrl });
  await assertHealthy(firstInstance.backendUrl);
  await assertHealthy(secondInstance.backendUrl);

  first.undeclaredVolumeName = createUndeclaredProjectVolume(first);
  invariant(
    dockerProjectResourceIds('volume', firstInstance.composeProjectName, requireStackEnvironment(first)).includes(
      first.undeclaredVolumeName
    ),
    'The undeclared project-labelled volume was not created'
  );

  invariant(
    await stopLocalDevelopmentInstance(firstInstance, fixture.reservationDirectory, fixture.baseEnvironment),
    'The first reserved stack did not own its cleanup'
  );
  first.stoppedThroughReservation = true;
  assertReservedCleanupComplete(first, fixture.reservationDirectory);
  await assertStopped(firstInstance.backendUrl);
  await assertHealthy(secondInstance.backendUrl);
}

async function captureFailure(failures: DockerProofFailure[], label: string, operation: () => void | Promise<void>) {
  try {
    await operation();
    return true;
  } catch (error) {
    failures.push({ label, error });
    return false;
  }
}

async function stopReservedStack(stack: DockerProofStack, fixture: DockerProofFixture, failures: DockerProofFailure[]) {
  if (!stack.instance || stack.stoppedThroughReservation) {
    return true;
  }
  const instance = stack.instance;
  return await captureFailure(failures, `${stack.label} reserved teardown`, async () => {
    invariant(
      await stopLocalDevelopmentInstance(instance, fixture.reservationDirectory, fixture.baseEnvironment),
      `${stack.label} reservation no longer owned its cleanup`
    );
    stack.stoppedThroughReservation = true;
  });
}

async function verifyReservedStackCleanup(
  stack: DockerProofStack,
  fixture: DockerProofFixture,
  failures: DockerProofFailure[]
) {
  if (!stack.instance || !stack.stoppedThroughReservation) {
    return true;
  }
  return await captureFailure(failures, `${stack.label} cleanup proof`, () => {
    assertReservedCleanupComplete(stack, fixture.reservationDirectory);
  });
}

async function runFallbackTeardown(stack: DockerProofStack, fallbackRequired: boolean, failures: DockerProofFailure[]) {
  if (!stack.environment || !fallbackRequired) {
    return;
  }
  const environment = stack.environment;
  await captureFailure(failures, `${stack.label} fallback teardown`, () => {
    composeDown(environment);
  });
}

async function removeUndeclaredVolume(stack: DockerProofStack, failures: DockerProofFailure[]) {
  const { instance, environment, undeclaredVolumeName } = stack;
  if (!undeclaredVolumeName) {
    return;
  }
  if (!instance) {
    return;
  }
  if (!environment) {
    return;
  }
  await captureFailure(failures, `${stack.label} undeclared-volume teardown`, () => {
    const volumeIds = dockerProjectResourceIds('volume', instance.composeProjectName, environment);
    if (volumeIds.includes(undeclaredVolumeName)) {
      runDockerProofCommand(['volume', 'rm', '--force', undeclaredVolumeName], environment);
    }
  });
}

async function tearDownDockerProofStack(
  stack: DockerProofStack,
  fixture: DockerProofFixture,
  failures: DockerProofFailure[]
) {
  const stopped = await stopReservedStack(stack, fixture, failures);
  const cleanupVerified = await verifyReservedStackCleanup(stack, fixture, failures);
  await runFallbackTeardown(stack, !stopped || !cleanupVerified, failures);
  await removeUndeclaredVolume(stack, failures);
}

function throwDockerProofFailures(failures: DockerProofFailure[]) {
  if (failures.length === 1) {
    throw failures[0].error;
  }
  if (failures.length > 1) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      failures
        .map(({ label, error }) => `${label}: ${error instanceof Error ? error.message : String(error)}`)
        .join('\n')
    );
  }
}

export async function proveDockerIsolation() {
  const fixture = createDockerProofFixture();
  const failures: DockerProofFailure[] = [];

  await captureFailure(failures, 'Isolation test', () => exerciseDockerIsolation(fixture));
  for (const stack of fixture.stacks) {
    await captureFailure(failures, `${stack.label} teardown`, () => tearDownDockerProofStack(stack, fixture, failures));
  }
  await captureFailure(failures, 'Isolation test files', () => {
    rmSync(fixture.temporaryDirectory, { recursive: true, force: true });
  });

  throwDockerProofFailures(failures);
  console.log('Two reserved local Convex instances stayed independent through startup, health checks, and teardown.');
}
